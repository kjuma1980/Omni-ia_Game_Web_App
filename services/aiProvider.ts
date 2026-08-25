import { ProjectData } from '../types';
import { translatePrompt } from '../constants/glossary';
import { computeDimensions, findAspect, isEmptyImageLatent } from '../constants/imageSizing';
import { describePose, directPosePrompt } from '../constants/poseDirectives';
import { applyRembg, findRembgNodes } from './workflowRembg';
import { adaptPrompts, detectCapabilities, injectUniversalTextPrompts } from './workflowCapabilities';
import { applyMapping, type WorkflowMapping } from './workflowRegistry';
import {
  approximateTokens,
  assembleSpritePrompt,
  toWeightedTags,
  type AssembledPrompt,
  type SpriteBackground,
} from './promptAssembly';
import { extractMeta, type GenerationMeta } from './generationMeta';
import { slotKeyForAction, slotKeyForPerspective, slotKeyForAnimation, loadSlots } from './workflowLibrary';
import { loadWorkflowsFromDB } from './db';
import { pedirWorkflowDelProveedor } from './omniDeploy';
import {
  describeDensity,
  describePerspective,
  describeStyle,
  parallaxLayerContract,
  stripSpriteOnlyNegatives,
  worldCompositionRules,
} from '../constants/promptDirectives';
import { generateOllamaCompletion, getOllamaModels, generateAnthropicCompletion, generateOpenAICompletion, generateGenericCompletion, generateLocalImage, generateLocalVideo, generateLocalTTS, generateLocalAudio, generateLocal3DModel, enviarJsonLocal } from './localService';
import { generateNarrativeText as geminiText, generateSpriteAsset as geminiSprite, generateAnimationVideo as geminiVideo, generateNarrativeAudio as geminiAudio, generateAudioAtmosphere as geminiAtmosphere } from './geminiService';
import { generateLlamaServerCompletion } from './llamaServerService';
import { ensureExclusiveMemoryContext, releasePostGenerationMemory } from './memoryOrchestrator';

/**
 * Universal AI Provider Proxy
 * Routes requests to the appropriate service (local or cloud) based on user settings
 */

export const stripChainOfThought = (text: string): string => {
  if (!text) return '';
  let cleaned = text;

  // 1. Quitar bloques <think>...</think> o <reasoning>...</reasoning>
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');

  // 2. Si el texto empieza con prefijos de borrador antes del punto 1, recortar desde la sección 1
  const firstSectionIdx = cleaned.search(/(?:^|\n)\s*1\.\s+/);
  if (firstSectionIdx > 0) {
    const preamble = cleaned.substring(0, firstSectionIdx);
    if (/Constraint Check|Drafting|Mental Translation|Self-Correction|Expert Video Game|Final Review|Structure:|Output Order:/i.test(preamble)) {
      cleaned = cleaned.substring(firstSectionIdx);
    }
  }

  // 3. Eliminar líneas sueltas de metadatos o etiquetas de borrador
  cleaned = cleaned.replace(/^\s*(?:Constraint Check|Drafting Spanish Section|Drafting the English translation|Self-Correction|Final Review of the Prompt|Mental Translation|Translating to English Technical terms).*$/gim, '');

  return cleaned.trim();
};

/**
 * Extrae y sintetiza de forma clara los errores de ComfyUI (especialmente en
 * validación de nodos, modelos no encontrados en carpetas, tensores, etc.).
 */
export function formatComfyError(data: any): string {
  if (!data) return 'Respuesta vacía de ComfyUI';
  let errObj = data;
  if (typeof data === 'string') {
    try {
      errObj = JSON.parse(data);
    } catch {
      return data.substring(0, 300);
    }
  }

  const parts: string[] = [];

  if (errObj?.node_errors && typeof errObj.node_errors === 'object') {
    for (const [nodeId, ne] of Object.entries(errObj.node_errors) as [string, any][]) {
      const classType = ne?.class_type || '?';
      const errors = ne?.errors || [];
      for (const e of errors) {
        const inputName = e?.extra_info?.input_name || '';
        const details = e?.details || e?.message || '';
        if (details.includes("not in ['No models found']") || details.includes('No models found')) {
          const folderHint = classType.toLowerCase().includes('vibevoice')
            ? "ComfyUI/models/vibevoice/"
            : classType.toLowerCase().includes('unet') || classType.toLowerCase().includes('check')
            ? "ComfyUI/models/checkpoints/ o unet/"
            : "la carpeta de modelos de ComfyUI";
          return `Falta el modelo en ComfyUI para el nodo '${classType}' (nodo ${nodeId}). Asegúrate de colocar el archivo del modelo en '${folderHint}'. (${details})`;
        }
        parts.push(`Nodo ${nodeId} (${classType})${inputName ? ` [${inputName}]` : ''}: ${details}`);
      }
    }
  }

  if (errObj?.error && typeof errObj.error === 'object') {
    const msg = errObj.error.message || errObj.error.details || '';
    if (msg && !parts.includes(msg)) parts.unshift(msg);
  } else if (typeof errObj?.error === 'string') {
    parts.unshift(errObj.error);
  }

  return parts.length > 0
    ? parts.join(' | ')
    : errObj?.error?.message || JSON.stringify(errObj).substring(0, 300);
}

// Text & Narrative
export const generateText = async (
  prompt: string,
  settings?: ProjectData['apiSettings'],
  isExpansion: boolean = false,
  useNpcsSettings: boolean = false,
  useCodeSettings: boolean = false,
  signal?: AbortSignal
): Promise<string> => {
  let textConfig;
  if (useCodeSettings && settings?.code) {
    textConfig = settings.code;
  } else if (useNpcsSettings && settings?.npcs) {
    textConfig = settings.npcs;
  } else {
    textConfig = settings?.text;
  }
  const provider = textConfig?.provider || 'gemini';
  const apiKey = textConfig?.apiKeys?.[provider] || textConfig?.apiKey;
  let activeModel = textConfig?.model || '';
  const category = useCodeSettings ? 'code' : useNpcsSettings ? 'npcs' : 'text';

  // Si es Ollama local, resolver el modelo real disponible para evitar registrar modelos fantasma en memoria
  if (provider === 'ollama' || provider === 'local') {
    try {
      const ollamaUrl = textConfig?.baseUrl || 'http://localhost:11434';
      const installed = await getOllamaModels(ollamaUrl);
      if (installed && installed.length > 0) {
        const availableNames = installed.map((m: any) => m.name || m.model);
        const matched = availableNames.find((n: string) => n.toLowerCase() === (activeModel || '').toLowerCase())
                     || (activeModel ? availableNames.find((n: string) => n.toLowerCase().includes(activeModel.toLowerCase())) : null)
                     || availableNames.find((n: string) => !n.includes('embed') && !n.includes('vision'))
                     || availableNames[0];
        if (matched) activeModel = matched;
      }
    } catch {
      // Continuar con el modelo configurado si no responde
    }
  }

  // Orquestación inteligente de memoria VRAM / RAM
  await ensureExclusiveMemoryContext(provider, activeModel, category, settings);

  try {
    // OmniDeploy: el texto lo escribe el Ollama del proveedor.
  //
  // Una sola rama cubre Narrativa, NPCs y Scripts porque las tres entran por
  // aqui: `textConfig` ya es la seccion que corresponda.
  if ((provider as string) === 'omnideploy') {
    const id = (textConfig as any)?.omniDeployDeploymentId as string | undefined;
    const clave = (textConfig as any)?.omniDeployApiKey as string | undefined;
    if (!id?.trim() || !clave?.trim()) {
      throw new Error(
        'Falta el Deployment ID o la API Key de OmniDeploy para textos. Pegalos en Ajustes.',
      );
    }
    const { generarTextoConOmniDeploy } = await import('./omniDeploy');
    return await generarTextoConOmniDeploy(
      { deploymentId: id.trim(), apiKey: clave.trim() },
      prompt,
      undefined,
      undefined,
      // Las tres ramas de texto usan el mismo camino pero son servicios
      // distintos para quien presta la GPU.
      useCodeSettings ? 'scripts' : useNpcsSettings ? 'npcs' : 'narrativa',
      signal,
      textConfig?.model || settings?.ollama?.model,
    );
  }

  if (provider === 'gemini') {
    return await geminiText(prompt, isExpansion, apiKey, textConfig?.model, signal);
  } else if (provider === 'ollama' || provider === 'lm-studio' || (provider as string) === 'local') {
    const baseUrl = provider === 'ollama'
      ? (textConfig?.baseUrl || settings?.ollama?.baseUrl || 'http://localhost:11434')
      : (textConfig?.baseUrl || 'http://localhost:1234/v1');
    const model = provider === 'ollama'
      ? (activeModel || textConfig?.model || settings?.ollama?.model || '')
      : (textConfig?.model || 'local-model');

    // Check if there is an explicit ollama apiKey to determine cloud mode
    const ollamaApiKey = settings?.ollama?.apiKey;
    const isCloudMode = !!(ollamaApiKey && (baseUrl.includes('api.ollama.com') || baseUrl.includes('api.lmstudio.ai') || baseUrl.startsWith('https://')));

    const isTranslation = prompt.toLowerCase().includes('translate the following') || 
                          prompt.toLowerCase().includes('traduce') || 
                          prompt.toLowerCase().includes('technical english');

    const defaultSystem = 'Eres un Lead Narrative Designer y Director Creativo galardonado de clase mundial para videojuegos AAA (nivel Hideo Kojima, Neil Druckmann, Sam Lake, Ken Levine, Hidetaka Miyazaki). Genera contenido inmersivo y fascinante en texto plano sin formato markdown.';
    const translationSystem = 'You are an expert video game technical translator and creative director. Translate the complete video game GDD / script document from Section 1 to Section 7 thoroughly into Technical English without omitting any section, detail, or dialogue line. Output ONLY clean plain text with simple numbers (1. 2. 3.), no markdown.';
    const system = isTranslation ? translationSystem : defaultSystem;

    let finalPrompt = isTranslation ? prompt : `Responde al siguiente requerimiento: ${prompt}`;
    if (isExpansion) {
      finalPrompt = `Eres un Lead Narrative Designer y Director Creativo de videojuegos de talla mundial (al nivel de Neil Druckmann, Hideo Kojima, Sam Lake, Ken Levine y Miyazaki). Transformas cualquier semilla o idea en una obra de arte narrativa y en un Documento de Diseño de Juego (GDD) profesional e inmersivo.

Idea base del usuario: "${prompt}"

DIRECTIVA CREATIVA Y PROHIBICIÓN ABSOLUTA DE CLICHÉS:
- PROHIBIDO USAR TÍTULOS O CONCEPTOS CLICHÉ GENÉRICOS DE IA como: "Ecos de...", "Sombras de...", "El Despertar de...", "Las Cenizas de...", "Crónicas de...", "El Destino de...".
- INVENTA UN TÍTULO ÚNICO, MEMORABLE Y DE ALTO IMPACTO (ejemplos de títulos potentes: "NEON VELOCITY: OVERDRIVE", "VECTOR CERO", "SIGNAL LOST", "PROTOCOLO SILENCIO", "DISRUPT", "STATIC SOULS"). El título debe ser completamente coherente con la temática y tono de la idea del usuario.
- Crea un lore con profundidad psicológica, alta tensión dramática, conflicto moral real y mecánicas creativas directamente vinculadas a la narrativa.

Estructura del GDD (usa numeracion simple 1. 2. 3. para las secciones):

1. Titulo del Juego y Logline
2. Lore del Mundo y Sinopsis
3. Personajes (perfiles psicológicos, arcos narrativos, motivaciones profundas)
4. Guion Completo de la Historia (dividido en Actos, con diálogos cinematográficos auténticos entre personajes)
5. Mecanicas de Juego (core loop, combate/evasión, interacciones sistémicas)
6. Progresion de Niveles (escenarios, ritmo, dificultad escalada)
7. Aspectos Multimedia (diseño sonoro, estética visual, paleta de color, efectos cinematográficos)

REGLAS DE FORMATO ABSOLUTAS:
- PROHIBIDO usar asteriscos (*), dobles asteriscos (**), almohadillas (#), guiones bajos (_) o cualquier caracter de formato markdown.
- PROHIBIDO escribir prefijos de idioma (ES:, EN:), o etiquetas dobles en los diálogos. La sección en español debe estar 100% únicamente en español latinoamericano.
- Escribe SOLO texto plano y limpio listo para lectura en voz alta.
- Usa solamente numeros (1. 2. 3.) y saltos de linea para secciones.

FORMATO DE SALIDA:
Escribe TODO el GDD completo, extenso, narrativamente fascinante e inmersivo 100% en espanol latinoamericano.
`;
    }

    if (isCloudMode) {
      // Cloud: Ollama Cloud / LM-Studio Cloud usan formato OpenAI-compatible
      return await generateGenericCompletion(
        baseUrl.includes('/v1') ? baseUrl : `${baseUrl}/v1/chat/completions`,
        finalPrompt,
        system,
        ollamaApiKey,
        isExpansion || isTranslation,
        signal
      );
    }

    // Local: usar API nativa de Ollama
    return await generateOllamaCompletion(baseUrl, model, finalPrompt, system, ollamaApiKey, signal);
  } else if ((provider as string) === 'llama-server') {
    const baseUrl = textConfig?.baseUrl || 'http://localhost:8088/v1';
    const model = textConfig?.model || 'local-model';
    const isTranslation = prompt.toLowerCase().includes('translate the following') || 
                          prompt.toLowerCase().includes('traduce') || 
                          prompt.toLowerCase().includes('technical english');
    const defaultSystem = 'Eres un Lead Narrative Designer y Director Creativo galardonado de clase mundial para videojuegos AAA (nivel Hideo Kojima, Neil Druckmann, Sam Lake, Ken Levine, Hidetaka Miyazaki). Genera contenido inmersivo y fascinante en texto plano sin formato markdown.';
    const translationSystem = 'You are an expert video game technical translator and creative director. Translate the complete video game GDD / script document from Section 1 to Section 7 thoroughly into Technical English without omitting any section, detail, or dialogue line. Output ONLY clean plain text with simple numbers (1. 2. 3.), no markdown.';
    const system = isTranslation ? translationSystem : defaultSystem;

    let finalPrompt = isTranslation ? prompt : `Responde al siguiente requerimiento: ${prompt}`;
    if (isExpansion) {
      finalPrompt = `Eres un Lead Narrative Designer y Director Creativo de videojuegos de talla mundial (al nivel de Neil Druckmann, Hideo Kojima, Sam Lake, Ken Levine y Miyazaki). Transformas cualquier semilla o idea en una obra de arte narrativa y en un Documento de Diseño de Juego (GDD) profesional e inmersivo.

Idea base del usuario: "${prompt}"

DIRECTIVA CREATIVA Y PROHIBICIÓN ABSOLUTA DE CLICHÉS:
- PROHIBIDO USAR TÍTULOS O CONCEPTOS CLICHÉ GENÉRICOS DE IA como: "Ecos de...", "Sombras de...", "El Despertar de...", "Las Cenizas de...", "Crónicas de...", "El Destino de...".
- INVENTA UN TÍTULO ÚNICO, MEMORABLE Y DE ALTO IMPACTO (ejemplos de títulos potentes: "NEON VELOCITY: OVERDRIVE", "VECTOR CERO", "SIGNAL LOST", "PROTOCOLO SILENCIO", "DISRUPT", "STATIC SOULS"). El título debe ser completamente coherente con la temática y tono de la idea del usuario.
- Crea un lore con profundidad psicológica, alta tensión dramática, conflicto moral real y mecánicas creativas directamente vinculadas a la narrativa.

Estructura del GDD (usa numeracion simple 1. 2. 3. para las secciones):

1. Titulo del Juego y Logline
2. Lore del Mundo y Sinopsis
3. Personajes (perfiles psicológicos, arcos narrativos, motivaciones profundas)
4. Guion Completo de la Historia (dividido en Actos, con diálogos cinematográficos auténticos entre personajes)
5. Mecanicas de Juego (core loop, combate/evasión, interacciones sistémicas)
6. Progresion de Niveles (escenarios, ritmo, dificultad escalada)
7. Aspectos Multimedia (diseño sonoro, estética visual, paleta de color, efectos cinematográficos)

REGLAS DE FORMATO ABSOLUTAS:
- PROHIBIDO usar asteriscos (*), dobles asteriscos (**), almohadillas (#), guiones bajos (_) o cualquier caracter de formato markdown.
- PROHIBIDO escribir prefijos de idioma (ES:, EN:), o etiquetas dobles en los diálogos. La sección en español debe estar 100% únicamente en español latinoamericano.
- Escribe SOLO texto plano y limpio listo para lectura en voz alta.
- Usa solamente numeros (1. 2. 3.) y saltos de linea para secciones.

FORMATO DE SALIDA:
Escribe TODO el GDD completo, extenso, narrativamente fascinante e inmersivo 100% en espanol latinoamericano.
`;
    }
    return await generateLlamaServerCompletion(baseUrl, model, finalPrompt, system, apiKey, {
      modelPath: settings?.llamaCpp?.modelPath,
      gpuLayers: settings?.llamaCpp?.gpuLayers,
      contextSize: settings?.llamaCpp?.contextSize,
      threads: settings?.llamaCpp?.threads,
      binaryPath: settings?.llamaCpp?.binaryPath,
      customArgs: settings?.llamaCpp?.customArgs
    }, signal);
  } else if (provider === 'anthropic' || provider === 'openai' || provider === 'deepseek' || provider === 'qwen' || provider === 'kimi' || provider === 'openrouter' || provider === 'cometapi') {
    if (!apiKey) throw new Error(`Se requiere una API Key para ${provider}.`);

    const isTranslation = prompt.toLowerCase().includes('translate the following') || 
                          prompt.toLowerCase().includes('traduce') || 
                          prompt.toLowerCase().includes('technical english');
    const defaultSystem = 'Eres un Lead Narrative Designer y Director Creativo galardonado de clase mundial para videojuegos AAA (nivel Hideo Kojima, Neil Druckmann, Sam Lake, Ken Levine, Hidetaka Miyazaki). Genera contenido inmersivo y fascinante en texto plano sin formato markdown.';
    const translationSystem = 'You are an expert video game technical translator and creative director. Translate the complete video game GDD / script document from Section 1 to Section 7 thoroughly into Technical English without omitting any section, detail, or dialogue line. Output ONLY clean plain text with simple numbers (1. 2. 3.), no markdown.';
    const system = isTranslation ? translationSystem : defaultSystem;

    let cloudPrompt = isExpansion ? `Eres un Lead Narrative Designer y Director Creativo de videojuegos de talla mundial (al nivel de Neil Druckmann, Hideo Kojima, Sam Lake, Ken Levine y Miyazaki). Transformas cualquier semilla o idea en una obra de arte narrativa y en un Documento de Diseño de Juego (GDD) profesional e inmersivo.

Idea base del usuario: "${prompt}"

DIRECTIVA CREATIVA Y PROHIBICIÓN ABSOLUTA DE CLICHÉS:
- PROHIBIDO USAR TÍTULOS O CONCEPTOS CLICHÉ GENÉRICOS DE IA como: "Ecos de...", "Sombras de...", "El Despertar de...", "Las Cenizas de...", "Crónicas de...", "El Destino de...".
- INVENTA UN TÍTULO ÚNICO, MEMORABLE Y DE ALTO IMPACTO (ejemplos de títulos potentes: "NEON VELOCITY: OVERDRIVE", "VECTOR CERO", "SIGNAL LOST", "PROTOCOLO SILENCIO", "DISRUPT", "STATIC SOULS"). El título debe ser completamente coherente con la temática y tono de la idea del usuario.
- Crea un lore con profundidad psicológica, alta tensión dramática, conflicto moral real y mecánicas creativas directamente vinculadas a la narrativa.

Estructura del GDD (usa numeracion simple 1. 2. 3. para las secciones):

1. Titulo del Juego y Logline
2. Lore del Mundo y Sinopsis
3. Personajes (perfiles psicológicos, arcos narrativos, motivaciones profundas)
4. Guion Completo de la Historia (dividido en Actos, con diálogos cinematográficos auténticos entre personajes)
5. Mecanicas de Juego (core loop, combate/evasión, interacciones sistémicas)
6. Progresion de Niveles (escenarios, ritmo, dificultad escalada)
7. Aspectos Multimedia (diseño sonoro, estética visual, paleta de color, efectos cinematográficos)

REGLAS DE FORMATO ABSOLUTAS:
- PROHIBIDO usar asteriscos, almohadillas, guiones bajos o cualquier formato markdown.
- PROHIBIDO incluir prefijos de idioma (ES:, EN:) o etiquetas de traducción dentro de la narrativa principal. La sección en español debe estar 100% en español.
- Escribe SOLO texto plano y limpio listo para lectura en voz alta.
- Usa solamente numeros (1. 2. 3.) y saltos de linea para secciones.

FORMATO DE SALIDA:
Escribe TODO el GDD completo, extenso, narrativamente fascinante e inmersivo 100% en espanol latinoamericano.
` : prompt;

    if (provider === 'anthropic') {
      return await generateAnthropicCompletion(cloudPrompt, system, apiKey, isExpansion || isTranslation, textConfig?.model, signal);
    } else {
      return await generateOpenAICompletion(cloudPrompt, system, apiKey, provider as any, isExpansion || isTranslation, textConfig?.model, signal);
    }
  } else if (provider === 'other') {
    const baseUrl = textConfig?.baseUrl || '';
    const isTranslation = prompt.toLowerCase().includes('translate the following') || 
                          prompt.toLowerCase().includes('traduce') || 
                          prompt.toLowerCase().includes('technical english');
    const defaultSystem = 'Eres un Lead Narrative Designer y Director Creativo galardonado de clase mundial para videojuegos AAA (nivel Hideo Kojima, Neil Druckmann, Sam Lake, Ken Levine, Hidetaka Miyazaki). Genera contenido inmersivo y fascinante en texto plano sin formato markdown.';
    const translationSystem = 'You are an expert video game technical translator and creative director. Translate the complete video game GDD / script document from Section 1 to Section 7 thoroughly into Technical English without omitting any section, detail, or dialogue line. Output ONLY clean plain text with simple numbers (1. 2. 3.), no markdown.';
    const system = isTranslation ? translationSystem : defaultSystem;

    let otherPrompt = isExpansion ? `Eres un Lead Narrative Designer y Director Creativo de videojuegos de talla mundial (al nivel de Neil Druckmann, Hideo Kojima, Sam Lake, Ken Levine y Miyazaki). Transformas cualquier semilla o idea en una obra de arte narrativa y en un Documento de Diseño de Juego (GDD) profesional e inmersivo.

Idea base del usuario: "${prompt}"

DIRECTIVA CREATIVA Y PROHIBICIÓN ABSOLUTA DE CLICHÉS:
- PROHIBIDO USAR TÍTULOS O CONCEPTOS CLICHÉ GENÉRICOS DE IA como: "Ecos de...", "Sombras de...", "El Despertar de...", "Las Cenizas de...", "Crónicas de...", "El Destino de...".
- INVENTA UN TÍTULO ÚNICO, MEMORABLE Y DE ALTO IMPACTO (ejemplos de títulos potentes: "NEON VELOCITY: OVERDRIVE", "VECTOR CERO", "SIGNAL LOST", "PROTOCOLO SILENCIO", "DISRUPT", "STATIC SOULS"). El título debe ser completamente coherente con la temática y tono de la idea del usuario.
- Crea un lore con profundidad psicológica, alta tensión dramática, conflicto moral real y mecánicas creativas directamente vinculadas a la narrativa.

Estructura del GDD (usa numeración simple 1. 2. 3. para las secciones):

1. Titulo del Juego y Logline
2. Lore del Mundo y Sinopsis
3. Personajes (perfiles psicológicos, arcos narrativos, motivaciones profundas)
4. Guion Completo de la Historia (dividido en Actos, con diálogos cinematográficos auténticos entre personajes)
5. Mecanicas de Juego (core loop, combate/evasión, interacciones sistémicas)
6. Progresion de Niveles (escenarios, ritmo, dificultad escalada)
7. Aspectos Multimedia (diseño sonoro, estética visual, paleta de color, efectos cinematográficos)

REGLAS DE FORMATO ABSOLUTAS:
- PROHIBIDO usar asteriscos, almohadillas, guiones bajos o cualquier formato markdown.
- PROHIBIDO escribir prefijos de idioma (ES:, EN:) en los diálogos.
- Escribe SOLO texto plano y limpio.
- Usa solamente números (1. 2. 3.) y saltos de línea para secciones.

FORMATO DE SALIDA:
Escribe TODO el GDD completo, extenso, narrativamente fascinante e inmersivo 100% en espanol latinoamericano.
` : prompt;
      return await generateGenericCompletion(baseUrl, otherPrompt, system, apiKey, isExpansion || isTranslation, signal);
    }

    throw new Error(`Provider ${provider} not fully implemented yet for Text generation.`);
  } finally {
    await releasePostGenerationMemory(provider, settings, activeModel);
  }
};

// Images (Assets & Sprites)
const applyNativeMattingIfSprite = async (
  rawImageB64: string,
  mode: string,
  extraContext?: any
): Promise<string> => {
  // Desactivado temporalmente para pruebas a petición del usuario. Retorna directamente la imagen pura del motor de IA.
  return rawImageB64;
};

/**
 * Decide que tuberia de mundos corresponde a una configuracion.
 *
 * Vive aqui y se exporta -en vez de estar en linea- para que la interfaz pueda
 * mostrar QUE tuberia se va a usar antes de generar. Si la interfaz repitiera
 * esta regla por su cuenta, las dos copias se separarian a la primera vez que
 * alguien anadiera un genero.
 *
 * La logica es identica a la que habia en linea: no se cambio ninguna rama.
 */
export function selectWorldPipeline(genre: string, density: string, style: string): 'a' | 'b' | 'c' {
  if (density === 'dungeon_chamber' || density === 'cave_passage' || genre === 'topdown_90') {
    return 'c';
  }
  if (
    genre === 'platformer_parallax' ||
    genre === 'platformer_2d' ||
    genre === 'platformer' ||
    genre === 'isometric_25d' ||
    genre === 'isometric_3d' ||
    genre === 'isometric' ||
    style === 'Silhouette Art' ||
    style === 'Stylized / Soft Shading'
  ) {
    return 'b';
  }
  return 'a';
}

export const generateImage = async (
  prompt: string,
  negativePrompt: string,
  settings?: ProjectData['apiSettings'],
  referenceImageBase64?: string,
  mode: 'sprite' | 'background' = 'sprite',
  customWorkflowJson?: string,
  uiState?: { style: string, action: string, details: string, autoRemoveBackground?: boolean, isDirectionalPose?: boolean, seed?: number, useChromaKeyGreen?: boolean, spriteBgMode?: 'white' | 'chromakey' | 'transparent', useBasicBackgrounds?: boolean, useProceduralWorld?: boolean, gameGenre?: string, worldDensity?: string, worldResolution?: number, worldAspect?: string, outputResolution?: number, removeBgInWorkflow?: boolean, rembgModel?: string, sheetView?: string, loraTriggerWords?: string, loraOwnsStyle?: boolean, onGenerationMeta?: (meta: GenerationMeta) => void, workflowMapping?: WorkflowMapping },
  signal?: AbortSignal
): Promise<string> => {
  const rawImageResult = await generateImageRaw(prompt, negativePrompt, settings, referenceImageBase64, mode, customWorkflowJson, uiState, signal);
  return await applyNativeMattingIfSprite(rawImageResult, mode, uiState);
};

const generateImageRaw = async (
  prompt: string,
  negativePrompt: string,
  settings?: ProjectData['apiSettings'],
  referenceImageBase64?: string,
  mode: 'sprite' | 'background' = 'sprite',
  customWorkflowJson?: string,
  uiState?: { style: string, action: string, details: string, autoRemoveBackground?: boolean, isDirectionalPose?: boolean, seed?: number, useChromaKeyGreen?: boolean, spriteBgMode?: 'white' | 'chromakey' | 'transparent', useBasicBackgrounds?: boolean, useProceduralWorld?: boolean, gameGenre?: string, worldDensity?: string, worldResolution?: number, worldAspect?: string, outputResolution?: number, removeBgInWorkflow?: boolean, rembgModel?: string, sheetView?: string, loraTriggerWords?: string, loraOwnsStyle?: boolean, onGenerationMeta?: (meta: GenerationMeta) => void, workflowMapping?: WorkflowMapping },
  signal?: AbortSignal
): Promise<string> => {
  // --- CONFIGURACIÓN DE REGLAS Y PROMPT STYLING UNIVERSAL ---
  const translatedPrompt = translatePrompt(prompt);
  let action = uiState?.action || 'Idle';
  let style = uiState?.style || '';

  // Heurística de respaldo: Si uiState está vacío (como al generar desde la pestaña de animación),
  // intentamos extraer el estilo y acción del prompt estructurado "Entity: ..., Action: ..., Style: ..., Details: ..."
  if (!style || style.trim() === '') {
    const styleMatch = prompt.match(/Style:\s*([^,]+)/i);
    if (styleMatch) {
      style = styleMatch[1].trim();
    }
  }
  if (!action || action === 'Idle') {
    const actionMatch = prompt.match(/Action:\s*([^,]+)/i);
    if (actionMatch) {
      action = actionMatch[1].trim();
    }
  }

  // Sanitización ultra-estricta para evitar crashes en Python/JSON o de red
  const sanitizedPrompt = (p: string) => p
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Eliminar caracteres de control
    .replace(/"/g, "'") // Cambiar comillas dobles por simples
    .replace(/\\/g, "/") // Cambiar backslashes por slashes
    .replace(/\n/g, " ") // Eliminar saltos de línea
    .trim();

  // Partes del prompt de sprite, para reescribirlas en el dialecto que toque
  // una vez se sepa que codificador usa el workflow.
  let partesPrompt: AssembledPrompt['parts'] | null = null;
  let actionPositive = "";
  let actionNegative = "";
  let finalPositive = "";
  let finalNegative = "";

  if (mode === 'background') {
    // Mapeo de estilos artísticos para fondos - pesos altos para dominar el prompt del usuario
    const stylePrompts: Record<string, { positive: string; negative: string }> = {
      'Gothic / Dark Fantasy': { positive: '(gothic dark fantasy:2.2), (dark ominous atmosphere:2.0), (dark moody sky:2.0), (ominous fog:1.8), (twisted dark trees:1.8), (dark stone ruins:1.8), (dramatic dark lighting:2.0), (eerie haunted environment:1.9), (dark purple and black tones:1.8), (no sunlight:1.8)', negative: '(bright colors:2.5), (cheerful:2.5), (sunny:2.5), (pastel:2.5), (colorful flowers:2.0), (sky blue:2.0), (mint green:2.0), (warm yellow:2.0), (children game:2.0), (cute:2.0), (cartoonish:1.8)' },
      'Colorful Fantasy': { positive: '(vibrant fantasy colors:2.0), (magical colorful world:2.0), (bright enchanted environment:1.8), (whimsical fantasy scenery:1.8)', negative: '(dark:1.8), (gloomy:1.8), (monochrome:1.8)' },
      'Pixel Art (8-bit)': { positive: '(pixel art style:2.2), (8-bit retro game background:2.2), (NES era aesthetic:2.0), (very limited color palette:2.0), (large chunky pixels:2.0), (retro 8-bit:2.0)', negative: '(photorealistic:2.5), (smooth gradients:2.0), (blurry:2.0), (3D render:2.0), (high resolution:2.0)' },
      'Pixel Art (16-bit)': { positive: '(pixel art style:2.2), (16-bit retro game background:2.2), (SNES era aesthetic:2.0), (limited color palette:1.8), (defined pixel edges:2.0), (retro 16-bit:2.0)', negative: '(photorealistic:2.5), (smooth gradients:2.0), (blurry:2.0), (3D render:2.0)' },
      'Pixel Art (HD)': { positive: '(HD pixel art style:2.2), (high definition pixel background:2.0), (modern pixel art:2.0), (detailed pixel scenery:1.8), (clean pixel edges:1.8)', negative: '(photorealistic:2.0), (blurry:2.0), (3D render:1.8), (low resolution:1.8)' },
      'Low Poly 3D': { positive: '(low poly 3D style:2.0), (geometric faceted landscape:1.8), (flat shading:1.8), (polygon art:1.8)', negative: '(photorealistic:1.8), (organic textures:1.6), (smooth:1.5)' },
      'Realistic 3D (PBR)': { positive: '(photorealistic environment:2.0), (physically based rendering:1.8), (cinematic lighting:1.8), (ultra detailed realistic:1.8)', negative: '(cartoon:2.0), (stylized:1.8), (anime:1.8), (flat:1.6)' },
      '2.5D Style': { positive: '(2.5D isometric environment:2.0), (parallax depth layers:1.8), (side-scrolling perspective:1.8), (layered background:1.8), (platformer game style:1.6)', negative: '(flat 2D:1.5), (full 3D:1.5)' },
      'Flat Vector': { positive: '(flat vector illustration:2.2), (clean geometric shapes:2.0), (solid flat colors:2.0), (vector art background:2.0), (no gradients:1.8), (graphic design style:1.8)', negative: '(photorealistic:2.0), (textured:1.8), (painterly:1.6), (3D:1.8)' },
      'Cartoon / Cel Shaded': { positive: '(cartoon cel shaded background:2.2), (bold outlines:2.0), (flat cel shading:2.0), (animated cartoon style:2.0), (vibrant cartoon colors:1.8)', negative: '(photorealistic:2.0), (3D render:1.8), (pixel art:1.5)' },
      'Digital Painting': { positive: '(digital painting background:2.0), (professional digital art:2.0), (painterly digital illustration:1.8), (rich color palette:1.8), (concept art quality:1.8)', negative: '(pixel art:1.5), (flat vector:1.5), (3D render:1.5)' },
      'Watercolor': { positive: '(watercolor background:2.0), (painted watercolor scenery:2.0), (soft watercolor washes:1.8), (watercolor paper texture:1.6)', negative: '(digital:1.6), (sharp:1.6), (3D:1.5)' },
      'Hand-drawn / Line Art': { positive: '(hand drawn line art background:2.2), (ink sketch scenery:2.0), (pencil drawn landscape:2.0), (hatching and cross-hatching:1.8), (monochrome ink illustration:1.8)', negative: '(photorealistic:2.0), (full color:1.5), (3D render:1.8), (digital painting:1.5)' },
      'Voxel Art': { positive: '(voxel art environment:2.2), (3D cubic blocks:2.0), (minecraft-like voxel landscape:2.0), (blocky geometric world:1.8), (isometric voxel view:1.8)', negative: '(smooth:1.8), (photorealistic:2.0), (pixel art 2D:1.5)' },
      'Retro Low-Res 3D (PS1)': { positive: '(PS1 retro 3D style:2.2), (low resolution 3D:2.0), (vertex jitter:1.8), (affine texture mapping:1.8), (early 3D game aesthetic:2.0), (1990s game graphics:1.8)', negative: '(photorealistic:2.0), (modern graphics:2.0), (ray tracing:2.0), (smooth:1.8)' },
      'Minimalist UI/UX': { positive: '(minimalist flat background:2.0), (clean simple scenery:1.8), (flat design landscape:2.0), (geometric minimal:1.8)', negative: '(cluttered:2.0), (detailed:1.6), (complex:1.6)' },
      'Chibi / SD': { positive: '(chibi game background:2.0), (cute kawaii scenery:1.8), (super deformed art style:1.8)', negative: '(dark:1.8), (realistic:1.8), (gritty:1.8)' },
      'Stylized Realism': { positive: '(stylized realistic background:1.8), (painterly environment:1.6), (semi-realistic art style:1.6)', negative: '' },
      'Top-down': { positive: '(top-down view:2.2), (overhead perspective:2.0), (birds eye view environment:2.0), (top-down game map:2.0), (tilemap style:1.8)', negative: '(side view:2.0), (perspective:1.8), (first person:2.0)' },
      'Pre-rendered Sprites': { positive: '(pre-rendered 3D background:2.0), (isometric pre-rendered scenery:1.8), (classic RPG pre-rendered style:2.0), (Baldurs Gate style:1.8), (painted over 3D:1.6)', negative: '(pixel art:1.5), (flat vector:1.5)' },
      'Silhouette Art': { positive: '(silhouette art style:2.2), (high contrast silhouette:2.0), (dark foreground shapes:2.2), (backlit dramatic scenery:2.0), (minimal color palette:1.8), (clean sharp outlines:1.8)', negative: '(photorealistic:2.0), (internal details:2.0), (texture:1.8), (bright foreground:2.0)' },
      'Stylized / Soft Shading': { positive: '(stylized soft shading style:2.2), (gentle color gradients:2.0), (soft lighting:2.0), (smooth colors:1.8), (painterly digital art:1.8), (cozy warm vibes:1.6)', negative: '(photorealistic:2.0), (harsh shadows:2.0), (dithering:1.8), (pixel art:1.8), (rough textures:1.6)' }
    };

    const styleData = stylePrompts[style] || { positive: '', negative: '' };

    // Reglas base para fondos: eliminar personajes
    actionPositive = `(empty landscape:1.5), (wide angle environment:1.3), (no characters:2.0), (no entities:2.0), (horizontal layout:1.7), (scenic background:1.5), (environment art:1.4)${styleData.positive ? ', ' + styleData.positive : ''}`;
    actionNegative = `(standing:3.0), (upright:3.0), (bipedal:3.0), (walking:3.0), (robot:3.0), (person:3.0), (human:3.0), (character:3.0), (humanoid:3.0), (face:2.5), (eyes:2.5), (legs:2.8), (arms:2.8), (debris:2.0), (scrap:2.0), (mechanical parts:2.0), (junk:2.0)${styleData.negative ? ', ' + styleData.negative : ''}`;

    finalPositive = `${actionPositive}, ${translatedPrompt}`;
    finalNegative = `${actionNegative}, ${negativePrompt || ""}`;
  } else if (directPosePrompt(action, translatedPrompt)) {
    /**
     * Poses de personaje y objeto, en PROSA y sin sintaxis de pesos.
     *
     * Antes cada una montaba su cadena aqui con `(termino:1.4)`. Dos problemas
     * medidos en este equipo: ComfyUI desactiva el ponderado por termino en los
     * codificadores basados en LLM, de modo que el peso no se aplica y ademas
     * los parentesis y el numero llegan al modelo como texto; y el KSampler
     * corre a cfg 1, con lo que la rama negativa se cancela entera y no se
     * puede corregir nada desde el negativo.
     *
     * El texto sale de `constants/poseDirectives.ts`, que es tambien de donde
     * bebe el refinador: la anatomia de cada pose se describe UNA vez. Tenerla
     * duplicada fue lo que dejo al refinador sin T-Pose durante meses.
     */
    actionPositive = directPosePrompt(action, translatedPrompt) as string;
    actionNegative = `blurry, low quality, distorted, watermark, text, signature${
      describePose(action) ? ', ' + describePose(action)!.negative : ''
    }`;
    // EL SUJETO VA PRIMERO. Antes iba detras de la pose, y en la hoja de modelo
    // eso son 600 caracteres de maquetacion por delante: el modelo gastaba su
    // atencion en como repartir las figuras y llegaba al personaje sin
    // presupuesto, de ahi que un "T-Rex ultra detallado" saliera generico. Lo
    // que se pide -quien es- pesa mas que como se encuadra.
    finalPositive = `${translatedPrompt}, ${actionPositive}`;
    finalNegative = `${actionNegative}, ${negativePrompt || ""}`;
  } else {
    // Resto de acciones, incluidas las del estudio de animacion.
    actionPositive = `high quality game sprite, full body visible from head to feet, single character alone in frame, centred, ${action} pose`;
    actionNegative = "blurry, low quality, distorted, watermark, text, signature";
    finalPositive = `${actionPositive}, ${translatedPrompt}`;
    finalNegative = `${actionNegative}, ${negativePrompt || ""}`;
  }

  /**
   * Ensamblado unico para sprites.
   *
   * Antes se montaba en tres sitios que se pisaban, y el resultado medido eran
   * 2810 caracteres con cuatro formas de decir "centrado" y tres de decir
   * "fondo blanco" ANTES de llegar al personaje. Ver `promptAssembly.ts` para
   * las dos pruebas que justifican el cambio de estilo.
   */
  if (mode !== 'background') {
    const isCustomBg = uiState?.useBasicBackgrounds === false && !uiState?.removeBgInWorkflow && !uiState?.autoRemoveBackground;
    const fondo: SpriteBackground = isCustomBg
      ? 'custom'
      : uiState?.useChromaKeyGreen || uiState?.spriteBgMode === 'chromakey'
        ? 'chromakey'
        : uiState?.spriteBgMode === 'transparent'
          ? 'transparent'
          : 'white';

    const guiaEstilo = describeStyle(style);
    const pose = describePose(action);
    const is3DStyle = (style || '').toLowerCase().includes('3d') ||
                      (style || '').toLowerCase().includes('pbr') ||
                      (style || '').toLowerCase().includes('octane') ||
                      (style || '').toLowerCase().includes('unreal') ||
                      (style || '').toLowerCase().includes('blender');

    const customNegatives = [
      negativePrompt || '',
      uiState?.loraOwnsStyle ? '' : guiaEstilo.negative,
      pose?.negative ?? '',
    ];

    const studioNegatives = [
      ...customNegatives,
      fondo === 'chromakey' ? 'green screen studio, studio floor, green shadow, photography backdrop' : 'black background, dark background',
    ];

    const ensamblado = assembleSpritePrompt({
      triggerWords: uiState?.loraTriggerWords,
      subject: translatedPrompt,
      // En la hoja de modelo cada pasada trae su propia vista, que sustituye a
      // la descripcion de cuatro figuras: aqui solo hay una.
      pose: uiState?.sheetView ?? directPosePrompt(action, translatedPrompt),
      // Si el LoRA define el estilo, la guia de la app se aparta: dos
      // direcciones artisticas tirando de la misma imagen se estorban, y
      // el LoRA gana siempre porque actua sobre los pesos del modelo.
      styleTraits: uiState?.loraOwnsStyle ? '' : guiaEstilo.positive,
      background: fondo,
      is3DStyle,
      negatives: fondo === 'custom' ? customNegatives : studioNegatives,
    });

    finalPositive = ensamblado.positive;
    finalNegative = ensamblado.negative;
    // El dialecto no se puede decidir aqui: depende del codificador, y el
    // workflow todavia no se ha leido. Se guardan las partes y se decide
    // mas abajo, cuando `detectCapabilities` ya ha inspeccionado el grafo.
    partesPrompt = ensamblado.parts;

    // Las sombras y el suelo se nombran solo en el negativo si es fondo de estudio/recorte.
    // En modo 'custom' se conservan para que el personaje proyecte sombras reales sobre su entorno.
    if (fondo !== 'custom') {
      finalPositive = finalPositive
        .replace(/(ground|drop|cast|contact|floor|surface|ambient|soft)?\s*shadows?/gi, '')
        .replace(/(shadowless|shading|ambient occlusion)/gi, '')
        .replace(/(chroma\s*key|chromakey|green\s*screen|studio\s*floor)/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+,/g, ',')
        .replace(/,\s*,/g, ',')
        .replace(/\s+\./g, '.')
        .trim();
    }
  }

  // `let` porque se adaptan al workflow del usuario una vez se conoce el grafo.
  let cleanPositivePrompt = sanitizedPrompt(finalPositive || translatedPrompt);
  let cleanNegativePrompt = sanitizedPrompt(finalNegative || negativePrompt || "text, watermark, blurry");

  let provider = settings?.image?.provider || 'comfyui';
  let baseUrl = settings?.image?.baseUrl || 'http://127.0.0.1:8188';

  // Orquestación inteligente de memoria VRAM / RAM
  const activeImageModel = settings?.image?.model || (provider === 'comfyui' ? 'workflow_active' : '');
  await ensureExclusiveMemoryContext(provider, activeImageModel, 'image', settings);

  try {
    let apiKey = settings?.image?.apiKeys?.[provider] || settings?.image?.apiKey;
  let cdApiKey = settings?.image?.comfyDeployApiKey;
  let cdDepId = settings?.image?.comfyDeployDeploymentId;
  // OmniDeploy, al lado y con el mismo patron que ComfyDeploy.
  let odApiKey = settings?.image?.omniDeployApiKey;
  let odDepId = settings?.image?.omniDeployDeploymentId;
  let defaultWorkflowId = settings?.image?.workflowId;

  if (mode === 'background') {
    const genre = uiState?.gameGenre || 'rpg';
    const density = uiState?.worldDensity || 'organic';
    const style = uiState?.style || '';
    const selectedPipeline = selectWorldPipeline(genre, density, style);
    // LAS TRES TUBERIAS DE ESCENARIO SE RETIRARON, por peticion del
    // propietario. Mundos usa ahora la configuracion de la seccion Imagen
    // -proveedor, URL y credenciales- y su workflow sale de la ranura de la
    // perspectiva elegida, o del general si esa ranura esta en blanco.
    //
    // Definir lo mismo en dos sitios hacia que se generase con un grafo
    // distinto del que se veia seleccionado. Los datos de proyectos antiguos
    // se ignoran a proposito: leerlos dejaria a una tuberia vieja mandando
    // sobre lo que el usuario ve en pantalla.
    void selectedPipeline;
  } else {
    if (!customWorkflowJson) {
      customWorkflowJson = settings?.image?.customWorkflow;
    }
  }

  if (provider === 'ollama') {
    apiKey = settings?.ollama?.apiKey || apiKey;
  }

  if (provider === 'comfydeploy') {
    return await generateLocalImage(
      'comfydeploy',
      cleanPositivePrompt,
      cleanNegativePrompt,
      512,
      512,
      cdApiKey,
      cdDepId,
      referenceImageBase64
    );
  }

  /**
   * OmniDeploy: ComfyUI, pero en el equipo del proveedor.
   *
   * RAMA PROPIA, no un caso dentro de la de ComfyUI: esa funciona y no se
   * toca. Lo que si se comparte son los AYUDANTES —`detectCapabilities`,
   * `adaptPrompts`, `isEmptyImageLatent`, `applyRembg`—, que son los mismos
   * que usa ComfyUI y viven fuera de las dos ramas. Asi no hay copia de logica
   * y arreglar uno arregla los dos.
   *
   * El grafo se prepara AQUI y viaja ya montado. El agente no reconstruye
   * nada: ejecuta exactamente lo que el usuario ve en su workflow.
   */
  if ((provider as string) === 'omnideploy') {
    if (!odDepId?.trim() || !odApiKey?.trim()) {
      throw new Error(
        'Falta el Deployment ID o la API Key de OmniDeploy. Pegalos en Ajustes > Imagen.',
      );
    }
    // EL GRAFO ES EL QUE ESTA CARGADO EN AJUSTES, en la pestana de ComfyUI.
    // El mismo campo, el mismo fichero, la misma inyeccion. OmniDeploy no
    // inventa nada ni consulta nada al otro lado: solo lo ejecuta en otra
    // maquina.
    const { generarConOmniDeploy, salidaADataUrl } = await import('./omniDeploy');

    // EL TAMANO LO DECIDE EL USUARIO, O EL WORKFLOW. Nadie mas.
    //
    // "Resolución del Sprite" tiene una opcion que vale CERO: «La del workflow
    // (no tocar)». Con ella no se manda ninguna medida y el grafo del proveedor
    // conserva la suya.
    //
    // Tratarla como un numero cualquiera es lo que deformo la imagen: con lado
    // 0, `computeDimensions` da ancho 0 -que `snap8` sube a su minimo de 256- y
    // alto 0/0 = NaN, que al no ser finito no se manda. El agente recibia
    // entonces ancho 256 sin alto, lo aplicaba sobre el 1088 del workflow y
    // salia un lienzo de 256x1088.
    const cruda = uiState?.outputResolution ?? uiState?.worldResolution;
    const lado = typeof cruda === 'number' && Number.isFinite(cruda) ? cruda : 0;
    const dim = lado > 0 ? computeDimensions(lado, uiState?.worldAspect ?? '1:1') : null;
    const semilla =
      typeof uiState?.seed === 'number' && Number.isFinite(uiState.seed)
        ? uiState.seed
        : Math.floor(Math.random() * 1_000_000_000);

    // EL CLIENTE NO TIENE QUE TENER NADA, pero la inyeccion la hace EL, con el
    // mismo codigo que usa contra un ComfyUI local. Se pide el grafo al
    // proveedor -que es quien lo tiene- y a partir de ahi el camino es el de
    // siempre, linea por linea. Nada se reimplementa al otro lado, asi que nada
    // puede comportarse distinto.
    const workflow = await pedirWorkflowDelProveedor(
      { deploymentId: odDepId.trim(), apiKey: odApiKey.trim() },
      mode === 'background' ? 'mundos' : 'imagen',
      mode === 'background'
        ? slotKeyForPerspective(uiState?.gameGenre || '')
        : slotKeyForAction(action),
      'ASSETS',
      mode === 'background' ? 'Mundos' : 'Sprites',
    );

    // A partir de aqui, IDENTICO a ComfyUI ---------------------------------

    // El prompt se adapta a lo que el grafo admite de verdad: un modelo a cfg 1
    // ignora el negativo, y uno sin CLIP ignora los pesos entre parentesis.
    const caps = detectCapabilities(workflow);
    const { positive, negative } = adaptPrompts(cleanPositivePrompt, cleanNegativePrompt, caps);

    // El negativo es el CLIPTextEncode al que apunta la entrada `negative` del
    // muestreador, no "el segundo": en un grafo el orden no significa nada.
    let idNegativo: string | null = null;
    for (const nodo of Object.values(workflow) as any[]) {
      if (String(nodo?.class_type || '').includes('KSampler')) {
        const ref = nodo?.inputs?.negative;
        if (Array.isArray(ref) && ref.length) idNegativo = String(ref[0]);
        break;
      }
    }

    for (const [id, nodo] of Object.entries(workflow) as [string, any][]) {
      const clase = String(nodo?.class_type || '');
      const campos = nodo?.inputs;
      if (!campos) continue;

      if (clase.includes('CLIPTextEncode') && typeof campos.text === 'string') {
        campos.text = id === idNegativo ? (caps.supportsNegativePrompt ? negative : '') : positive;
      } else if (isEmptyImageLatent(clase)) {
        // Solo si el usuario eligio una resolucion. Con «La del workflow (no
        // tocar)» manda el lienzo del proveedor.
        if (dim) {
          if (typeof campos.width === 'number') campos.width = dim.width;
          if (typeof campos.height === 'number') campos.height = dim.height;
        }
      } else if (clase.includes('KSampler') && typeof campos.seed === 'number') {
        campos.seed = semilla;
      }
    }

    // Recorte de fondo: el mismo ayudante que usa ComfyUI, que sabe insertar o
    // quitar el nodo recableando el grafo.
    if (uiState?.removeBgInWorkflow !== undefined) {
      const resRembg = applyRembg(workflow as any, !!uiState.removeBgInWorkflow, uiState?.rembgModel);
      if (!resRembg.ok) {
        console.warn(`[Omni IA Game] ${resRembg.reason}`);
      }
    }

    const salidas = await generarConOmniDeploy(
      { deploymentId: odDepId.trim(), apiKey: odApiKey.trim() },
      { prompt: positive, tipo: 'imagen', workflow, servicio: mode === 'background' ? 'mundos' : 'sprites', signal: (uiState as any)?.signal },
    );
    const img =
      salidas.find((s) => (s.kind ?? '') === 'imagen') ??
      salidas.find((s) => /\.(png|jpg|jpeg|webp)$/i.test(s.name)) ??
      salidas[0];
    if (!img) {
      throw new Error('La GPU del proveedor termino el trabajo pero no devolvio ninguna imagen.');
    }
    return salidaADataUrl(img);
  }

  if ((provider as string) === 'openart' || (provider as string) === 'youart') {
    const endpoint = (provider as string) === 'openart' ? 'https://openart.ai/api/v1/generate' : 'https://youart.ai/api/v1/image';
    return await generateLocalImage(
      endpoint,
      cleanPositivePrompt,
      cleanNegativePrompt,
      512,
      512,
      apiKey,
      undefined,
      referenceImageBase64
    );
  }

  if (provider === 'gemini') {
    // We hack the parameters to fit the original gemini implementation signature
    return await geminiSprite("Entity", action as any, style as any, cleanPositivePrompt, cleanNegativePrompt, referenceImageBase64, mode, apiKey);
  } else if (provider === 'openai') {
    if (!apiKey) {
      throw new Error("Se requiere una API Key para OpenAI Image Generation (DALL-E). Por favor, agrégala en la pestaña de Ajustes.");
    }
    const model = settings?.image?.model || 'dall-e-3';
    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

    if (!invokeFn) {
      throw new Error("Entorno Tauri no disponible para la generación con OpenAI.");
    }

    // Helper para limpiar errores de proxy (reemplaza "ComfyUI error" o extrae el JSON interno de error del gateway)
    const cleanProxyError = (error: any): string => {
      const errMsg = error?.message || String(error);
      if (errMsg.includes("ComfyUI error")) {
        const match = errMsg.match(/ComfyUI error \d+(?:\s+[a-zA-Z0-9\s]+)?:?\s*(\{[\s\S]+\})/);
        if (match) {
          try {
            const jsonBody = JSON.parse(match[1]);
            if (jsonBody?.error?.message) {
              return jsonBody.error.message;
            }
          } catch (e) {
            // ignorar fallo de parseo
          }
        }
        return errMsg.replace(/ComfyUI error/g, "Error del Servidor API");
      }
      return errMsg;
    };

    const finalRequestUrl = 'https://api.openai.com/v1/images/generations';

    console.log(`[Omni IA Game] Generating image using OpenAI (DALL-E) | Model: ${model} | URL: ${finalRequestUrl}`);

    // Intentar primero con b64_json (más rápido y limpio si es soportado por el API directo de OpenAI)
    try {
      const result = await invokeFn('proxy_request', {
        url: finalRequestUrl,
        method: 'POST',
        payload: {
          model: model,
          prompt: cleanPositivePrompt,
          n: 1,
          size: model === 'dall-e-3' ? '1024x1024' : '512x512',
          response_format: 'b64_json'
        },
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      let data = typeof result === 'string' ? JSON.parse(result) : result;
      if (data?.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      if (data?.data?.[0]?.b64_json) {
        return `data:image/png;base64,${data.data[0].b64_json}`;
      }
      
      // Si no devolvió b64_json pero sí una URL, la descargamos
      if (data?.data?.[0]?.url) {
        const imageUrl = data.data[0].url;
        console.log(`[Omni IA Game] OpenAI returned a URL instead of b64_json. Fetching via proxy: ${imageUrl}`);
        return await invokeFn('proxy_request', {
          url: imageUrl,
          method: 'GET'
        });
      }
    } catch (firstTryError: any) {
      const cleanedFirstMsg = cleanProxyError(firstTryError);
      console.warn(`[Omni IA Game] First attempt with b64_json failed: ${cleanedFirstMsg}. Retrying with default URL format...`);

      // Segundo intento: Formato URL estándar (máxima compatibilidad con proxies e interfaces OpenAI compatibles)
      try {
        const result = await invokeFn('proxy_request', {
          url: finalRequestUrl,
          method: 'POST',
          payload: {
            model: model,
            prompt: cleanPositivePrompt,
            n: 1,
            size: model === 'dall-e-3' ? '1024x1024' : '512x512'
          },
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        let data = typeof result === 'string' ? JSON.parse(result) : result;
        if (data?.error) {
          throw new Error(data.error.message || JSON.stringify(data.error));
        }

        if (data?.data?.[0]?.url) {
          const imageUrl = data.data[0].url;
          console.log(`[Omni IA Game] Fetching image from OpenAI URL: ${imageUrl}`);
          return await invokeFn('proxy_request', {
            url: imageUrl,
            method: 'GET'
          });
        }
      } catch (secondTryError: any) {
        throw new Error(`Error en la generación de OpenAI: ${cleanProxyError(secondTryError)}`);
      }
    }

    throw new Error("OpenAI no devolvió una imagen en formato válido.");
  } else if (provider === 'comfyui' || provider === 'a1111' || (provider as string) === 'local' || provider === 'ollama') {
    baseUrl = baseUrl || settings?.image?.baseUrl || 'http://127.0.0.1:8188';

    // Priority to global settings if provider is ollama
    if (provider === 'ollama') {
      baseUrl = settings?.ollama?.baseUrl || baseUrl;
    }

    // Limpieza de URL para evitar dobles slashes o endpoints incorrectos
    baseUrl = baseUrl.replace(/\/$/, '').replace(/\/api\/prompt$/, '');

    if (provider === 'comfyui' && customWorkflowJson) {
      try {
        const workflow = JSON.parse(customWorkflowJson);
        const seed = Math.floor(Math.random() * 1000000000);

        /**
         * Se inspecciona el workflow del usuario para saber que admite de
         * verdad, en vez de escribir el prompt para un modelo concreto.
         *
         * Omni IA Game no esta casado con ningun modelo: cada usuario trae el
         * suyo. Un SDXL aprovecha los pesos "(termino:1.4)" y el prompt
         * negativo; un Z-Image Turbo, un Flux o cualquier destilado a cfg 1 no
         * aprovecha ninguna de las dos cosas, y ademas los parentesis le llegan
         * como texto literal. Ante la duda se asume que SI soporta, que es el
         * comportamiento historico: mejor emitir un peso que se ignore que
         * suprimir un enfasis que habria funcionado.
         */
        const caps = detectCapabilities(workflow);
        if (caps.notes.length > 0) {
          console.log('[Omni IA Game] Capacidades del workflow:', {
            pesos: caps.supportsPromptWeights,
            negativo: caps.supportsNegativePrompt,
            cfg: caps.cfg,
            codificador: caps.encoder,
          });
          caps.notes.forEach((n) => console.log(`  · ${n}`));
        }

        /**
         * Aqui se elige el dialecto. El contenido es el mismo; cambia como se
         * dice. Un CLIP quiere etiquetas cortas con pesos y trocea cada 77
         * tokens; un codificador LLM quiere prosa y el orden le basta para
         * saber que es importante.
         */
        if (partesPrompt && caps.profile.syntax === 'weighted-tags') {
          cleanPositivePrompt = toWeightedTags(partesPrompt);
          console.log('[Omni IA Game] Prompt reescrito en etiquetas con pesos para un codificador CLIP.');
        }

        const tokens = approximateTokens(cleanPositivePrompt);
        if (tokens > caps.profile.usefulTokens) {
          caps.notes.push(
            `El prompt ronda ${tokens} tokens y este codificador (${caps.profile.label}) aprovecha unos ${caps.profile.usefulTokens}. Lo que va al final pierde peso.`,
          );
        }

        const adaptado = adaptPrompts(cleanPositivePrompt, cleanNegativePrompt, caps);
        cleanPositivePrompt = adaptado.positive;
        cleanNegativePrompt = adaptado.negative;
        const clientId = (crypto as any).randomUUID?.() || Math.random().toString(36).substring(2);

        // Helper para buscar nodos de forma inteligente (por título o por clase)
        const findNodeId = (wf: any, classType: string, title?: string) => {
          if (title) {
            const titleLower = title.toLowerCase();
            const found = Object.entries(wf).find(([_, n]: any) =>
              n._meta?.title && String(n._meta.title).toLowerCase().includes(titleLower)
            );
            if (found) return found[0];
          }
          const found = Object.entries(wf).find(([_, n]: any) => n.class_type === classType);
          return found ? found[0] : null;
        };

        // Inyección dinámica de relajación de pesos y denoising en pose direccional (consistencia tridimensional)
        if (uiState?.isDirectionalPose) {
          console.log("[Omni IA Game] Dynamic pose consistency relaxation active.");
          // 1. Denoise sampler check - restaurado a 0.75 para dar flexibilidad a la rotación y evitar deformaciones
          const samplerNodeId = findNodeId(workflow, 'KSampler') || findNodeId(workflow, 'KSamplerAdvanced');
          if (samplerNodeId && workflow[samplerNodeId]?.inputs) {
            if (workflow[samplerNodeId].inputs.denoise !== undefined) {
              workflow[samplerNodeId].inputs.denoise = 0.75;
              console.log(`[Omni IA Game] Injected KSampler denoise: 0.75 into node: ${samplerNodeId}`);
            }
          }
          // 2. IP-Adapter weight check - subimos a 0.65 para bloquear el diseño y colores del personaje
          const ipAdapterNodeId = findNodeId(workflow, 'IPAdapterApply') || findNodeId(workflow, 'IPAdapterAdvanced') || findNodeId(workflow, 'IPAdapter');
          if (ipAdapterNodeId && workflow[ipAdapterNodeId]?.inputs) {
            if (workflow[ipAdapterNodeId].inputs.weight !== undefined) {
              workflow[ipAdapterNodeId].inputs.weight = 0.65;
              console.log(`[Omni IA Game] Injected IP-Adapter weight: 0.65 into node: ${ipAdapterNodeId}`);
            }
          }
        }

        // 1. Inyección de Prompt y Configuración
        if (cleanPositivePrompt && cleanPositivePrompt.trim() !== "") {
          let finalPromptToInject = cleanPositivePrompt;

          // Reestructuración premium para forzar la pose direccional al principio absoluto del prompt
          if (uiState?.isDirectionalPose) {
            let directionHeader = "";
            const lowerPrompt = cleanPositivePrompt.toLowerCase();
            if (lowerPrompt.includes("right") || lowerPrompt.includes("derecha")) {
              directionHeader = "(Side Right View:1.9), (full standing side profile facing right:1.9), (90 degree side rotation:1.9), (completely turned sideways:1.8), (narrow profile silhouette:1.5), ";
            } else if (lowerPrompt.includes("left") || lowerPrompt.includes("izquierda")) {
              directionHeader = "(Side Left View:1.9), (full standing side profile facing left:1.9), (90 degree side rotation:1.9), (completely turned sideways:1.8), (narrow profile silhouette:1.5), ";
            } else if (lowerPrompt.includes("back") || lowerPrompt.includes("rear") || lowerPrompt.includes("trasera") || lowerPrompt.includes("atrás") || lowerPrompt.includes("espalda")) {
              directionHeader = "(Back View:1.9), (rear view:1.9), (character facing away from camera:1.8), (backward view:1.8), (symmetrical back outline:1.5), ";
            }

            if (directionHeader) {
              const isCustomBg = uiState?.useBasicBackgrounds === false && !uiState?.removeBgInWorkflow && !uiState?.autoRemoveBackground;
              if (!isCustomBg) {
                // Limpiamos menciones base del fondo blanco para re-ensamblarlas limpiamente
                const cleanedBase = cleanPositivePrompt
                  .replace(/\(isolated on pure white background:[0-9.]+\),?/g, "")
                  .replace(/\(no shadows:[0-9.]+\),?/g, "")
                  .replace(/\(plain white background:[0-9.]+\),?/g, "")
                  .replace(/\(clean background:[0-9.]+\),?/g, "")
                  .trim();

                finalPromptToInject = `${directionHeader}(isolated on pure white background:1.6), (no shadows:1.5), ${cleanedBase}`;
              } else {
                finalPromptToInject = `${directionHeader}${cleanPositivePrompt}`;
              }
              console.log(`[Omni IA Game] Front-loaded direction prompt for consistent pose: "${finalPromptToInject.substring(0, 120)}..."`);
            }
          }

          console.log("[Omni IA Game] Inyectando prompts universales en el workflow de imagen...", { prompt: finalPromptToInject, seed });
          injectUniversalTextPrompts(workflow, finalPromptToInject, cleanNegativePrompt);
        } else {
          console.log("[Omni IA Game] UI prompt is empty. Preserving original positive prompts in workflow.");
          if (cleanNegativePrompt && cleanNegativePrompt.trim() !== "") {
            injectUniversalTextPrompts(workflow, undefined, cleanNegativePrompt);
          }
        }

        // 2. Inyección de Semilla
        const targetSeed = uiState?.seed !== undefined ? uiState.seed : seed;
        Object.entries(workflow).forEach(([id, node]: any) => {
          if (node.inputs) {
            if (node.inputs.seed !== undefined) {
              node.inputs.seed = targetSeed;
              console.log(`[Omni IA Game] Injecting seed (${targetSeed}) into node ${id} (${node.class_type})`);
            }
            if (node.inputs.noise_seed !== undefined) {
              node.inputs.noise_seed = targetSeed;
              console.log(`[Omni IA Game] Injecting noise_seed (${targetSeed}) into node ${id} (${node.class_type})`);
            }
          }
        });

        // 2b. Inyección de resolución para mundos.
        //
        // Hasta ahora el tamaño de salida NUNCA se inyectaba: era el que
        // trajera el workflow del usuario, normalmente 512 o 1024. Ningún
        // prompt puede cambiarlo, por muy detallado que sea. Un mapa completo
        // a 512 px no admite acercamiento y no sirve como escenario jugable.
        //
        // Solo se toca en modo mundo y solo si la interfaz pide una resolución
        // concreta: los sprites siguen usando exactamente lo que diga su
        // workflow, que es lo que ya funciona.
        const requestedSize = uiState?.useProceduralWorld ? uiState?.worldResolution : undefined;
        if (typeof requestedSize === 'number' && requestedSize > 0) {
          const { width: targetW, height: targetH } = computeDimensions(
            requestedSize,
            uiState?.worldAspect || '1:1',
          );

          // Se busca por PREDICADO y no por nombre fijo: en el ComfyUI de este
          // equipo hay 60 nodos con `width` y `height` que devuelven un latente,
          // y casi ninguno se puede tocar. `LatentUpscale` y `LatentCrop`
          // transforman un latente ya existente -reescribirlos descuadraria la
          // cadena- y los `Empty*Video*` definen fotogramas, no una imagen.
          const targets = Object.entries(workflow).filter(
            ([, node]: any) =>
              isEmptyImageLatent(node?.class_type ?? '') &&
              node?.inputs?.width !== undefined &&
              node?.inputs?.height !== undefined,
          );

          if (targets.length === 0) {
            console.warn(
              '[Omni IA Game] El workflow no tiene un nodo de latente de imagen vacio: el tamano lo decide el propio workflow.',
            );
          } else {
            for (const [id, node] of targets as any) {
              node.inputs.width = targetW;
              node.inputs.height = targetH;
              console.log(
                `[Omni IA Game] Injecting output size ${targetW}x${targetH} into node ${id} (${node.class_type})`,
              );
            }
          }
        }

        // 2c. Recorte de fondo dentro del propio workflow.
        //
        // No se "mutea" un nodo: el formato API no tiene campo `mode`, asi que
        // activar es INSERTAR el nodo y recablear, y desactivar es quitarlo y
        // devolver el cableado a su sitio. Ver `workflowRembg.ts`.
        if (uiState?.removeBgInWorkflow !== undefined) {
          const resultado = applyRembg(
            workflow as any,
            !!uiState.removeBgInWorkflow,
            uiState.rembgModel,
          );
          if (!resultado.ok) {
            console.warn(`[Omni IA Game] ${resultado.reason}`);
          } else if (uiState.removeBgInWorkflow) {
            console.log('[Omni IA Game] Recorte de fondo insertado en el workflow.');
          }
        }

        // 3. Inyección de Imagen de Referencia para Consistencia Visual (ControlNet/IP-Adapter)
        if (referenceImageBase64) {
          const loadImageNodeId = findNodeId(workflow, 'LoadImage') || findNodeId(workflow, 'LoadImageBase64');
          if (loadImageNodeId && workflow[loadImageNodeId] && workflow[loadImageNodeId].inputs) {
            let imageName = referenceImageBase64;
            
            // Si la imagen es un base64, la subimos a ComfyUI local usando su API oficial de carga de imágenes
            if (referenceImageBase64.startsWith('data:image/') || referenceImageBase64.length > 1000) {
              try {
                console.log("[Omni IA Game] Base64 reference image detected. Uploading to local ComfyUI...");
                const cleanBase64 = referenceImageBase64.replace(/^data:image\/\w+;base64,/, "");
                const byteCharacters = atob(cleanBase64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'image/png' });
                
                const formData = new FormData();
                formData.append('image', blob, `omni_reference_${Date.now()}.png`);
                formData.append('overwrite', 'true');
                
                // Usamos fetch directo para la carga binaria (CORS está habilitado en ComfyUI)
                const uploadRes = await fetch(`${baseUrl}/upload/image`, {
                  method: 'POST',
                  body: formData
                });
                
                if (uploadRes.ok) {
                  const uploadData = await uploadRes.json();
                  imageName = uploadData.name || uploadData.filename || imageName;
                  console.log(`[Omni IA Game] Reference image successfully uploaded to ComfyUI as: ${imageName}`);
                } else {
                  console.error("Failed to upload reference image to ComfyUI:", uploadRes.statusText);
                }
              } catch (uploadErr) {
                console.error("Error uploading image to ComfyUI, falling back to direct base64 injection:", uploadErr);
              }
            } else if (referenceImageBase64.includes('filename=')) {
              // Si es una URL de ComfyUI, extraemos el filename
              try {
                const urlParams = new URLSearchParams(referenceImageBase64.split('?')[1]);
                imageName = urlParams.get('filename') || referenceImageBase64;
              } catch (e) {
                // Ignore parse errors
              }
            }
            
            // Limpiamos cualquier prefijo de base64 si falló el upload y tuvimos que inyectarlo crudo
            const finalImageValue = imageName.replace(/^data:image\/\w+;base64,/, "");
            workflow[loadImageNodeId].inputs.image = finalImageValue;
            console.log(`[Omni IA Game] Visual Consistency injected into node ${loadImageNodeId}: "${finalImageValue.substring(0, 40)}..."`);
          }
        }

        // 4. Inyección / Autoinserción dinámica del nodo RemBG en ComfyUI local para manejo nativo de fondo
        if (mode === 'sprite') {
          const bgMode = uiState?.spriteBgMode || 'white';
          const rembgBgColor = bgMode === 'chromakey' ? 'chroma green' : (bgMode === 'transparent' ? 'none' : 'white');
          const isTransparent = bgMode === 'transparent';

          const existingRembgNodes = findRembgNodes(workflow as any);

          if (existingRembgNodes.length > 0) {
            // Si ya existe al menos un nodo de remoción de fondo (por ejemplo omni_rembg o BiRefNetRMBG),
            // configuramos sus propiedades de color/transparencia si es de tipo Image Rembg, pero JAMÁS
            // insertamos un segundo nodo RemBG que cree cadenas redundantes.
            for (const nodeId of existingRembgNodes) {
              const node = workflow[nodeId];
              if (node && node.inputs) {
                if ('background_color' in node.inputs) {
                  node.inputs.background_color = rembgBgColor;
                }
                if ('transparency' in node.inputs) {
                  node.inputs.transparency = isTransparent;
                }
              }
            }
          } else if (uiState?.removeBgInWorkflow) {
            // Autoinserción dinámica sólo si no existía ningún nodo RemBG y se pidió recorte
            const saveNodeId = findNodeId(workflow, 'SaveImage', '#output') ||
              findNodeId(workflow, 'PreviewImage', '#output') ||
              findNodeId(workflow, 'SaveImage') ||
              findNodeId(workflow, 'PreviewImage');

            if (saveNodeId && workflow[saveNodeId]?.inputs?.images) {
              const currentInput = workflow[saveNodeId].inputs.images;
              const newRembgId = "999_omni_rembg";
              workflow[newRembgId] = {
                class_type: "Image Rembg (Remove Background)",
                _meta: { title: "#rembg" },
                inputs: {
                  images: currentInput,
                  transparency: isTransparent,
                  model: "u2net",
                  post_processing: false,
                  only_mask: false,
                  alpha_matting: false,
                  alpha_matting_foreground_threshold: 240,
                  alpha_matting_background_threshold: 10,
                  alpha_matting_erode_size: 10,
                  background_color: rembgBgColor
                }
              };
            }
          }
        }

        /**
         * ------------------------------------------------------------------
         *  Mapeo explicito del workflow registrado
         * ------------------------------------------------------------------
         *  Ultima pasada, cuando las heuristicas ya han hecho lo suyo y el
         *  prompt final ya esta montado y adaptado al dialecto del codificador.
         *
         *  Va DESPUES y no en lugar de las heuristicas a proposito. Donde
         *  aciertan, escribe el mismo valor y no cambia nada; donde fallan
         *  -que es lo que ocurria en silencio con cualquier grafo distinto de
         *  los habituales- el mapeo si sabe a que nodo ir, porque lo decidio
         *  una persona o se dedujo siguiendo los cables del grafo.
         *
         *  Y si el mapeo ha caducado porque el workflow se edito por fuera,
         *  `applyMapping` lanza con el nodo y el motivo. Se deja subir: es
         *  preferible no generar a generar mal sin avisar, que es exactamente
         *  el fallo que hizo que 373 generaciones salieran sin negativo.
         */
        if (uiState?.workflowMapping) {
          const valores: Record<string, unknown> = { prompt: cleanPositivePrompt };

          if (caps.supportsNegativePrompt) {
            valores.negative = cleanNegativePrompt;
          }
          if (uiState.seed !== undefined) {
            valores.seed = uiState.seed;
          }
          if (uiState.outputResolution && uiState.outputResolution > 0) {
            const dim = computeDimensions(uiState.outputResolution, uiState.worldAspect ?? '1:1');
            valores.width = dim.width;
            valores.height = dim.height;
          }

          // Se copia sobre el mismo objeto en vez de reasignarlo, para no
          // depender de si `workflow` se declaro como const mas arriba.
          const inyectado = applyMapping(workflow as any, uiState.workflowMapping, valores as any);
          for (const clave of Object.keys(inyectado)) {
            (workflow as any)[clave] = (inyectado as any)[clave];
          }

          console.log('[Omni IA Game] Mapeo del workflow aplicado:', Object.keys(valores).join(', '));
        }

        const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

        /**
         * Se registra lo que DE VERDAD se envia, leyendo el grafo ya inyectado
         * y no la configuracion de la interfaz. Si una inyeccion fallara en
         * silencio, el registro contaria lo ocurrido y no lo pretendido, que es
         * justo cuando estos datos hacen falta.
         */
        if (uiState?.onGenerationMeta) {
          uiState.onGenerationMeta(
            extractMeta(workflow, {
              provider: 'comfyui',
              positivePrompt: cleanPositivePrompt,
              negativePrompt: caps.supportsNegativePrompt ? cleanNegativePrompt : '',
              notes: caps.notes,
            }),
          );
        }

        if (invokeFn) {
          console.log(`[Omni IA Game] Queuing workflow with clientId: ${clientId}`, workflow);

          const result = await invokeFn('proxy_request', {
            url: `${baseUrl}/prompt`,
            method: 'POST',
            payload: {
              prompt: workflow,
              client_id: clientId
            }
          }).catch((err: any) => {
            console.error("Proxy Request Failed Details:", err);
            // Si falla por 500, intentamos leer el cuerpo del error si viene en el string
            throw new Error(`Error en el Proxy de Rust: ${err}`);
          });

          let data;
          try {
            data = typeof result === 'string' ? JSON.parse(result) : result;
          } catch (e) {
            console.error("Failed to parse ComfyUI response:", result);
            throw new Error("ComfyUI devolvió una respuesta no válida (posible error 500 interno).");
          }

          if (!data || !data.prompt_id) {
            throw new Error(formatComfyError(data));
          }
          const promptId = data.prompt_id;

          // Polling extendido para workflows pesados (10 minutos)
          console.log("Polling ComfyUI for prompt_id (Long Timeout):", promptId);
          let imageFound = false;
          let attempts = 0;
          const maxAttempts = 600; // 10 minutos (1 intento por segundo)

          while (!imageFound && attempts < maxAttempts) {
            if (signal?.aborted) throw new Error("Generación cancelada por el usuario.");
            await new Promise(r => setTimeout(r, 1000));
            attempts++;

            try {
              const historyResult = await invokeFn('proxy_request', {
                url: `${baseUrl}/history/${promptId}`,
                method: 'GET'
              });

              const historyData = typeof historyResult === 'string' ? JSON.parse(historyResult) : historyResult;

              if (historyData[promptId] && historyData[promptId].outputs) {
                const outputs = historyData[promptId].outputs;
                const isCompleted = historyData[promptId].status?.completed === true;

                // Helper para determinar si un nodo de guardado/previsualización está alimentado por un nodo de pose
                const isPoseImageNode = (wf: any, nodeId: string) => {
                  const node = wf[nodeId];
                  if (!node) return false;
                  const classType = (node.class_type || '').toLowerCase();
                  if (classType.includes('posenode') || classType.includes('openpose')) return true;

                  if (node.inputs) {
                    for (const val of Object.values(node.inputs)) {
                      if (Array.isArray(val) && val.length >= 1 && typeof val[0] === 'string') {
                        const parentId = val[0];
                        const parentClass = (wf[parentId]?.class_type || '').toLowerCase();
                        if (parentClass.includes('posenode') || parentClass.includes('openpose')) {
                          return true;
                        }
                      }
                    }
                  }
                  return false;
                };

                // 1. Buscamos específicamente el nodo titulado "#output"
                const outputNodeId = findNodeId(workflow, 'SaveImage', '#output') || findNodeId(workflow, 'PreviewImage', '#output');

                if (outputNodeId && outputs[outputNodeId]?.images) {
                  const img = outputs[outputNodeId].images[0];
                  // Forzamos el uso del proxy para obtener la imagen final y evitar el 403 Forbidden
                  console.log("[Omni IA Game] Fetching final image via Proxy to avoid 403...");
                  const finalImageUrl = await invokeFn('proxy_request', {
                    url: `${baseUrl}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`,
                    method: 'GET'
                  });

                  imageFound = true;
                  return finalImageUrl;
                }

                // 2. Solo evaluamos el fallback de imágenes cuando la ejecución HAYA CONCLUIDO (isCompleted === true)
                if (isCompleted) {
                  for (const nodeId of Object.keys(outputs)) {
                    if (isPoseImageNode(workflow, nodeId)) {
                      console.log(`[Omni IA Game] Omitiendo imagen del nodo ${nodeId} por estar alimentado por una pose.`);
                      continue;
                    }
                    if (outputs[nodeId].images && outputs[nodeId].images.length > 0) {
                      const img = outputs[nodeId].images[0];
                      // Forzamos el uso del proxy para obtener la imagen final y evitar el 403 Forbidden
                      console.log("[Omni IA Game] Fetching final image (fallback) via Proxy to avoid 403...");
                      const finalImageUrl = await invokeFn('proxy_request', {
                        url: `${baseUrl}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`,
                        method: 'GET'
                      });

                      imageFound = true;
                      return finalImageUrl;
                    }
                  }
                }
              }

              if (historyData[promptId] && historyData[promptId].status) {
                const messages = historyData[promptId].status.messages;
                if (messages) {
                  const execError = messages.find((m: any) => m[0] === 'execution_error');
                  if (execError && execError[1]) {
                    const details = execError[1];
                    const nodeType = details.node_type || 'Desconocido';
                    const nodeId = details.node_id || 'Desconocido';
                    const excMsg = details.exception_message || details.exception_type || 'Error en ejecución de nodo ComfyUI';
                    throw new Error(`La ejecución del workflow falló en ComfyUI en el Nodo ${nodeId} (${nodeType}): ${excMsg}`);
                  }
                }
              }
            } catch (e: any) {
              const errMsg = typeof e === 'string' ? e : (e.message || String(e));
              if (errMsg.includes("falló en ComfyUI")) throw new Error(errMsg);

              // Si la conexión es rechazada, significa que ComfyUI se cerró o crasheó
              if (errMsg.toLowerCase().includes("connection refused") || errMsg.toLowerCase().includes("tcp connect error")) {
                throw new Error("Se perdió la conexión con ComfyUI. Es posible que el servidor haya colapsado por falta de memoria (OOM).");
              }

              // Silent retry to avoid focus loss issues in some environments for other minor network errors
              // console.warn("Polling retry...", attempts);
            }
          }

          throw new Error("Timeout: El workflow es demasiado pesado. Aumente la potencia local o simplifique el workflow.");
        }

        const response = await fetch(`${baseUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: workflow,
            client_id: clientId
          })
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Error en la API de ComfyUI (HTTP ${response.status}): ${errText || response.statusText}`);
        }
        const data = await response.json();
        return `comfyui_prompt_id:${data.prompt_id}`;
      } catch (e: any) {
        console.error("[Omni IA Game] Error al enviar prompt a ComfyUI:", e);
        throw e;
      }
    } else if (provider === 'comfyui' && !customWorkflowJson) {
      throw new Error(`ComfyUI requiere un Workflow JSON cargado en la configuración de la pestaña de Assets (Imágenes) o asignado a esta acción para funcionar. Por favor, abre el panel de Ajustes y carga tu Workflow JSON en la sección correspondiente.`);
    }

      // Proveedores locales genéricos (A1111 / SD WebUI)
      if (provider === 'other') {
        return await generateLocalImage(`${baseUrl}/sdapi/v1/txt2img`, prompt, negativePrompt, 512, 512, apiKey);
      }
    }

    throw new Error(`Provider ${provider} not fully implemented yet for Image generation.`);
  } finally {
    await releasePostGenerationMemory(provider, settings, activeImageModel);
  }
};

/**
 * Ejecuta un trabajo en la GPU del proveedor con el workflow del usuario.
 *
 * El agente ejecuta ComfyUI, asi que puede producir lo mismo que ComfyUI:
 * imagenes, animaciones, video, musica, efectos y voces. Lo que decide que sale
 * es EL WORKFLOW, no el tipo de peticion.
 *
 * Por eso todas las ramas pasan por aqui y solo cambian el grafo que mandan. Y
 * por eso el grafo es obligatorio fuera de imagen: sin el, el agente monta uno
 * de imagen por defecto, que para una cancion no sirve de nada.
 */
const ejecutarEnOmniDeploy = async (
  deploymentId: string | undefined,
  apiKey: string | undefined,
  tipo: 'imagen' | 'video' | 'voz' | 'musica' | 'sfx' | '3d',
  params: {
    prompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    seed?: number;
    imagenInicial?: string;
    /** Lo que el cliente marco en su pestana, sea la que sea. */
    opciones?: Record<string, unknown>;
  },
  etiqueta: string,
) => {
  if (!deploymentId?.trim() || !apiKey?.trim()) {
    throw new Error(
      `Falta el Deployment ID o la API Key de OmniDeploy para ${etiqueta}. Pegalos en Ajustes.`,
    );
  }
  // OMNIDEPLOY SOLO PIDE CREDENCIALES. No se le manda ningun grafo, ni siquiera
  // si el cliente tuviera uno cargado: el workflow lo pone la maquina que
  // presta la GPU, que es la que sabe que modelos tiene instalados.
  const { generarConOmniDeploy } = await import('./omniDeploy');
  return await generarConOmniDeploy(
    { deploymentId: deploymentId.trim(), apiKey: apiKey.trim() },
    { ...params, tipo },
  );
};

// Video (Animations)
export const generateVideo = async (
  prompt: string,
  initImageBase64: string,
  settings?: ProjectData['apiSettings'],
  negativePrompt?: string,
  action?: string
): Promise<string> => {
  const provider = settings?.video?.provider || 'comfyui';
  const apiKey = settings?.video?.apiKeys?.[provider] || settings?.video?.apiKey;
  const activeVideoModel = settings?.video?.model || 'video_workflow';

  // Orquestación inteligente de memoria VRAM / RAM
  await ensureExclusiveMemoryContext(provider, activeVideoModel, 'video', settings);

  try {
    let customWorkflowJson = settings?.video?.customWorkflow;
    if (action) {
      const slots = loadSlots();
      const animSlotKey = slotKeyForAnimation(action);
      if (slots[animSlotKey]) {
        const guardados = (await loadWorkflowsFromDB()) as any[];
        const found = guardados.find((w) => w.id === slots[animSlotKey]);
        if (found?.workflow) {
          customWorkflowJson = JSON.stringify(found.workflow);
        }
      }
    }

    // OmniDeploy va por `generateLocalVideo`, EL MISMO CAMINO QUE COMFYUI
    if ((provider as string) === 'omnideploy') {
      const baseUrlOmni = settings?.video?.baseUrl || 'http://127.0.0.1:8188';
      return await generateLocalVideo(
        `${baseUrlOmni}/api/prompt`,
        prompt,
        settings?.video?.omniDeployApiKey,
        'omnideploy',
        initImageBase64,
        settings?.video?.omniDeployDeploymentId,
        negativePrompt,
        customWorkflowJson,
        settings?.video?.promptNode,
        settings?.video?.negativeNode,
        settings?.video?.imageNode,
        settings?.video?.model,
      );
    }

    if (provider === 'comfydeploy') {
      return await generateLocalVideo(
        'comfydeploy',
        prompt,
        settings?.video?.comfyDeployApiKey,
        'comfydeploy',
        initImageBase64,
        settings?.video?.comfyDeployDeploymentId
      );
    }

    if (provider === 'gemini') {
      return await geminiVideo(prompt, initImageBase64, '16:9', apiKey);
    }

    if (provider === 'openart' || provider === 'youart') {
      const endpoint = provider === 'openart' ? 'https://openart.ai/api/v1/generate' : 'https://api.youart.ai/v1/video';
      return await generateLocalVideo(
        endpoint,
        prompt,
        apiKey,
        provider,
        initImageBase64,
        settings?.video?.workflowId,
        negativePrompt
      );
    }

    // Local / other providers (comfyui, a1111)
    const baseUrl = settings?.video?.baseUrl || 'http://127.0.0.1:8188';
    return await generateLocalVideo(
      `${baseUrl}/api/prompt`,
      prompt,
      apiKey,
      provider,
      initImageBase64,
      settings?.video?.workflowId,
      negativePrompt,
      customWorkflowJson,
      settings?.video?.promptNode,
      settings?.video?.negativeNode,
      settings?.video?.imageNode,
      settings?.video?.model
    );
  } finally {
    await releasePostGenerationMemory(provider, settings, activeVideoModel);
  }
};

export const generateTTS = async (
  text: string,
  voice: string = 'Normal Male',
  settings?: ProjectData['apiSettings'],
  lang: string = 'ES',
  enthusiasm: number = 50,
  useSpainSpanish: boolean = false,
  options?: { useRandomSeed?: boolean; customSeed?: number }
): Promise<{ data: string, mimeType: string }> => {
  const provider = settings?.audio?.ttsProvider || 'local';

  // Orquestación inteligente de memoria VRAM / RAM
  await ensureExclusiveMemoryContext(provider, voice, 'tts', settings);

  try {
    // processedText ahora es simplemente el texto original para evitar que motores locales lean las etiquetas técnicas.
    const processedText = text;

    console.log(`[Omni IA Game] generateTTS: ${processedText.substring(0, 30)}... | Voice: ${voice} | Lang: ${lang} | Provider: ${provider} | Enthusiasm: ${enthusiasm}`);



  // MAPEO MAESTRO DE ENTIDADES (Global para Comfy y Local)
  const VOICE_MAP_ES_MX: Record<string, { local: string, comfy: string }> = {
    'Heroic Male': { local: 'es-MX-JorgeNeural', comfy: 'VibeVoice_Library/heroic_male_es.wav' },
    'Heroic Female': { local: 'es-MX-DaliaNeural', comfy: 'VibeVoice_Library/heroic_female_es.wav' },
    'Villainous Dark': { local: 'es-MX-JorgeNeural', comfy: 'VibeVoice_Library/villainous_dark_es.wav' },
    'Wise Elder': { local: 'es-MX-JorgeNeural', comfy: 'VibeVoice_Library/wise_elder_es.wav' },
    'Young Adventurer': { local: 'es-MX-DaliaNeural', comfy: 'VibeVoice_Library/young_adventurer_es.wav' },
    'Mystical Entity': { local: 'es-MX-DaliaNeural', comfy: 'VibeVoice_Library/mystical_entity_es.wav' },
    'Robot/AI': { local: 'es-MX-JorgeNeural', comfy: 'VibeVoice_Library/robot_ai_es.wav' },
    'Normal Female': { local: 'es-MX-DaliaNeural', comfy: 'VibeVoice_Library/normal_female_es.wav' },
    'Normal Male': { local: 'es-MX-JorgeNeural', comfy: 'VibeVoice_Library/normal_male_es.wav' },
    'Duende Male': { local: 'es-MX-JorgeNeural', comfy: 'VibeVoice_Library/duende_male_es.wav' },
    'Duende Female': { local: 'es-MX-DaliaNeural', comfy: 'VibeVoice_Library/duende_female_es.wav' },
    'Little Boy': { local: 'es-MX-JorgeNeural', comfy: 'VibeVoice_Library/little_boy_es.wav' },
    'Little Girl': { local: 'es-MX-DaliaNeural', comfy: 'VibeVoice_Library/little_girl_es.wav' }
  };

  const VOICE_MAP_ES_ES: Record<string, { local: string, comfy: string }> = {
    'Heroic Male': { local: 'es-ES-AlvaroNeural', comfy: 'VibeVoice_Library/heroic_male_es.wav' },
    'Heroic Female': { local: 'es-ES-ElviraNeural', comfy: 'VibeVoice_Library/heroic_female_es.wav' },
    'Villainous Dark': { local: 'es-ES-AlvaroNeural', comfy: 'VibeVoice_Library/villainous_dark_es.wav' },
    'Wise Elder': { local: 'es-ES-AlvaroNeural', comfy: 'VibeVoice_Library/wise_elder_es.wav' },
    'Young Adventurer': { local: 'es-ES-ElviraNeural', comfy: 'VibeVoice_Library/young_adventurer_es.wav' },
    'Mystical Entity': { local: 'es-ES-ElviraNeural', comfy: 'VibeVoice_Library/mystical_entity_es.wav' },
    'Robot/AI': { local: 'es-ES-AlvaroNeural', comfy: 'VibeVoice_Library/robot_ai_es.wav' },
    'Normal Female': { local: 'es-ES-ElviraNeural', comfy: 'VibeVoice_Library/normal_female_es.wav' },
    'Normal Male': { local: 'es-ES-AlvaroNeural', comfy: 'VibeVoice_Library/normal_male_es.wav' },
    'Duende Male': { local: 'es-ES-AlvaroNeural', comfy: 'VibeVoice_Library/duende_male_es.wav' },
    'Duende Female': { local: 'es-ES-ElviraNeural', comfy: 'VibeVoice_Library/duende_female_es.wav' },
    'Little Boy': { local: 'es-ES-AlvaroNeural', comfy: 'VibeVoice_Library/little_boy_es.wav' },
    'Little Girl': { local: 'es-ES-ElviraNeural', comfy: 'VibeVoice_Library/little_girl_es.wav' }
  };

  const VOICE_MAP_EN: Record<string, { local: string, comfy: string }> = {
    'Heroic Male': { local: 'en-US-ChristopherNeural', comfy: 'VibeVoice_Library/heroic_male_en.wav' },
    'Heroic Female': { local: 'en-US-JennyNeural', comfy: 'VibeVoice_Library/heroic_female_en.wav' },
    'Villainous Dark': { local: 'en-US-SteffanNeural', comfy: 'VibeVoice_Library/villainous_dark_en.wav' },
    'Wise Elder': { local: 'en-US-BrianNeural', comfy: 'VibeVoice_Library/wise_elder_en.wav' },
    'Young Adventurer': { local: 'en-US-MichelleNeural', comfy: 'VibeVoice_Library/young_adventurer_en.wav' },
    'Mystical Entity': { local: 'en-US-AriaNeural', comfy: 'VibeVoice_Library/mystical_entity_en.wav' },
    'Robot/AI': { local: 'en-US-GuyNeural', comfy: 'VibeVoice_Library/robot_ai_en.wav' },
    'Normal Female': { local: 'en-US-JennyNeural', comfy: 'VibeVoice_Library/normal_female_en.wav' },
    'Normal Male': { local: 'en-US-ChristopherNeural', comfy: 'VibeVoice_Library/normal_male_en.wav' },
    'Duende Male': { local: 'en-US-GuyNeural', comfy: 'VibeVoice_Library/duende_male_en.wav' },
    'Duende Female': { local: 'en-US-JennyNeural', comfy: 'VibeVoice_Library/duende_female_en.wav' },
    'Little Boy': { local: 'en-US-GuyNeural', comfy: 'VibeVoice_Library/little_boy_en.wav' },
    'Little Girl': { local: 'en-US-JennyNeural', comfy: 'VibeVoice_Library/little_girl_en.wav' }
  };

  const VOICE_MAP_GEMINI: Record<string, string> = {
    'Heroic Male': 'Puck',
    'Heroic Female': 'Aoede',
    'Villainous Dark': 'Charon',
    'Wise Elder': 'Fenrir',
    'Young Adventurer': 'Puck',
    'Mystical Entity': 'Kore',
    'Robot/AI': 'Charon',
    'Normal Female': 'Aoede',
    'Normal Male': 'Fenrir',
    'Duende Male': 'Puck',
    'Duende Female': 'Kore',
    'Little Boy': 'Puck',
    'Little Girl': 'Aoede'
  };



  const apiKey = settings?.audio?.apiKeys?.[provider] || settings?.audio?.apiKey;

  if (provider === 'comfydeploy') {
    const resultUrl = await generateLocalTTS(
      settings?.audio?.ttsComfyDeployDeploymentId || 'comfydeploy',
      processedText,
      voice,
      settings?.audio?.ttsComfyDeployApiKey,
      'comfydeploy'
    );
    const response = await fetch(resultUrl);
    const blob = await response.blob();
    const b64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });
    return { data: b64, mimeType: 'audio/wav' };
  }

  if (provider === 'gemini') {
    const geminiVoice = VOICE_MAP_GEMINI[voice] || 'Fenrir';
    return await geminiAudio(processedText, geminiVoice, 'vocal', apiKey);
  } else if (provider === 'suno') {
    if (!apiKey) throw new Error("Se requiere una API Key para Suno.");
    const result = await generateLocalAudio(
      'https://api.sunoapi.org/api/v1/generate',
      processedText,
      apiKey,
      'suno',
      {
        lyrics: processedText,
        isInstrumental: false,
        title: "Voice Speech"
      }
    );
    let audioUrl = "";
    if (typeof result === 'string') {
      audioUrl = result;
    } else if (result instanceof Blob) {
      const arrayBuffer = await result.arrayBuffer();
      const b64String = btoa(
        new Uint8Array(arrayBuffer)
          .reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      return { data: b64String, mimeType: 'audio/mp3' };
    }
    
    if (audioUrl) {
      const audioRes = await fetch(audioUrl);
      const blob = await audioRes.blob();
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      });
      return { data: b64, mimeType: 'audio/mp3' };
    }
    throw new Error("No se pudo generar el audio con Suno.");
  } else if (provider === 'comfyui' || (provider as string) === 'omnideploy') {
    // OmniDeploy prepara el grafo EXACTAMENTE igual que ComfyUI —es ComfyUI
    // en otra maquina— y solo cambia a donde se envia, mas abajo. Cuando el
    // proveedor es comfyui el camino es identico al de siempre.
    const baseUrl = settings?.audio?.ttsUrl || 'http://127.0.0.1:8188';
    const cleanUrl = baseUrl.replace(/\/$/, '').replace(/\/api\/prompt$/, '');
    // Con OmniDeploy el grafo lo pone el proveedor: el cliente solo escribe sus
    // credenciales. Con ComfyUI local es el que el usuario tiene cargado, como
    // siempre.
    let customWorkflowJson = settings?.audio?.ttsCustomWorkflow;
    if ((provider as string) === 'omnideploy') {
      const id = settings?.audio?.ttsOmniDeployDeploymentId;
      const clave = settings?.audio?.ttsOmniDeployApiKey;
      if (!id?.trim() || !clave?.trim()) {
        throw new Error('Falta el Deployment ID o la API Key de OmniDeploy para la voz. Pegalos en Ajustes.');
      }
      const grafo = await pedirWorkflowDelProveedor(
        { deploymentId: id.trim(), apiKey: clave.trim() },
        'voz',
      );
      customWorkflowJson = JSON.stringify(grafo);
    }
    const nodeIdentifier = settings?.audio?.ttsModel;

    if (!customWorkflowJson) {
      throw new Error(`Para usar ${provider}, debes cargar un workflow .json en la configuración Global.`);
    }

    try {
      const workflow = JSON.parse(customWorkflowJson);
      const clientId = (crypto as any).randomUUID?.() || Math.random().toString(36).substring(2);

      const findNodeId = (wf: any, searchStr: string) => {
        if (!searchStr || typeof searchStr !== 'string') return null;
        if (wf[searchStr]) return searchStr;
        const entries = Object.entries(wf);
        let found = entries.find(([_, n]: any) =>
          n.class_type === searchStr ||
          n._meta?.title === searchStr
        );
        if (!found) {
          found = entries.find(([_, n]: any) =>
            n.class_type?.toLowerCase() === searchStr.toLowerCase() ||
            n._meta?.title?.toLowerCase() === searchStr.toLowerCase()
          );
        }
        return found ? found[0] : null;
      };

      // 1. Inyección Universal y Resiliente de Texto TTS (4 Capas Adaptativas)
      let targetNodeId = nodeIdentifier ? findNodeId(workflow, nodeIdentifier) : null;

      // Capa 2: Fallbacks para cajas de texto y motores de voz (Priorizando nodos contenedores de texto string)
      if (!targetNodeId) {
        console.log(`[Omni IA Game] Buscando nodo de texto TTS en el workflow ComfyUI...`);
        targetNodeId = 
          findNodeId(workflow, "PrimitiveStringMultiline") ||
          findNodeId(workflow, "Text String (Multiline)") ||
          findNodeId(workflow, "TextMultiline") ||
          findNodeId(workflow, "StringLiteral") ||
          findNodeId(workflow, "PrimitiveString") ||
          findNodeId(workflow, "VibeVoiceInput") ||
          findNodeId(workflow, "VibeVoiceSingleSpeakerNode") ||
          findNodeId(workflow, "VibeVoiceNode") ||
          findNodeId(workflow, "VibeVoice") ||
          findNodeId(workflow, "VibeVoiceAdvancedNode") ||
          findNodeId(workflow, "KokoroTTS") ||
          findNodeId(workflow, "KokoroTTSNode") ||
          findNodeId(workflow, "F5TTS_Node") ||
          findNodeId(workflow, "F5TTS") ||
          findNodeId(workflow, "CosyVoiceNode") ||
          findNodeId(workflow, "CosyVoice") ||
          findNodeId(workflow, "ChatterBoxNode") ||
          findNodeId(workflow, "ChatterBox") ||
          findNodeId(workflow, "MeloTTSNode") ||
          findNodeId(workflow, "CLIPTextEncode");
      }

      let textInjected = false;
      const validTextKeys = ['string', 'text', 'prompt', 'text_input', 'tts_text', 'speech_text', 'input_text', 'script', 'dialogue', 'value', 'multiline_text'];
      const protectedKeys = new Set(['model', 'ckpt_name', 'checkpoint', 'vae', 'clip', 'sampler_name', 'scheduler', 'speaker', 'voice', 'language', 'device', 'precision', 'audio', 'filename', 'path', 'upload', 'type', 'output_format']);

      // Helper para inyectar texto en un nodo específico
      const injectIntoNode = (node: any, nodeId: string): boolean => {
        if (!node || !node.inputs) return false;
        // Primero buscar en validTextKeys
        for (const key of validTextKeys) {
          if (node.inputs[key] !== undefined) {
            // Si el campo es un enlace Array a otro nodo (ej: ["1", 0]), inyectar en el nodo fuente enlazado
            if (Array.isArray(node.inputs[key]) && node.inputs[key].length > 0) {
              const sourceNodeId = String(node.inputs[key][0]);
              const sourceNode = workflow[sourceNodeId];
              if (sourceNode && sourceNode.inputs) {
                for (const sKey of validTextKeys) {
                  if (sourceNode.inputs[sKey] !== undefined && !Array.isArray(sourceNode.inputs[sKey])) {
                    sourceNode.inputs[sKey] = processedText;
                    console.log(`[Omni IA Game] Inyectado texto de guión en nodo enlazado "${sourceNodeId}" (${sourceNode._meta?.title || sourceNode.class_type}) campo "${sKey}"`);
                    return true;
                  }
                }
              }
            } else if (typeof node.inputs[key] === 'string' || typeof node.inputs[key] === 'number') {
              node.inputs[key] = processedText;
              console.log(`[Omni IA Game] Inyectado texto de guión en nodo TTS "${nodeId}" (${node._meta?.title || node.class_type}) campo "${key}"`);
              return true;
            }
          }
        }
        return false;
      };

      // Capa 3: Inyección directa en el nodo objetivo identificado
      if (targetNodeId && workflow[targetNodeId]) {
        textInjected = injectIntoNode(workflow[targetNodeId], targetNodeId);
      }

      // Capa 4: Fallback Heurístico Universal para workflows personalizados/experimentales
      if (!textInjected) {
        console.log(`[Omni IA Game] Aplicando fallback heurístico universal para inyección de texto TTS...`);
        for (const [nodeId, node] of Object.entries(workflow) as [string, any][]) {
          if (node && node.inputs) {
            const classType = (node.class_type || '').toLowerCase();
            const title = (node._meta?.title || '').toLowerCase();
            
            const isTextOrVoiceNode = 
              classType.includes('primitive') || classType.includes('string') || classType.includes('text') ||
              classType.includes('tts') || classType.includes('voice') || classType.includes('speech') ||
              title.includes('text') || title.includes('guion') || title.includes('script') ||
              title.includes('dialog') || title.includes('prompt') || title.includes('string');

            if (isTextOrVoiceNode) {
              for (const key of validTextKeys) {
                if (node.inputs[key] !== undefined && typeof node.inputs[key] === 'string' && !Array.isArray(node.inputs[key]) && !protectedKeys.has(key)) {
                  node.inputs[key] = processedText;
                  textInjected = true;
                  console.log(`[Omni IA Game] Inyección heurística de texto TTS en nodo "${nodeId}" (${node._meta?.title || node.class_type}) campo "${key}"`);
                  break;
                }
              }
              if (textInjected) break;
            }
          }
        }
      }

      // 2. INYECCIÓN DINÁMICA DE AUDIO DE REFERENCIA (VibeVoice y motores de clonación zero-shot)
      const map = lang === 'EN' ? VOICE_MAP_EN : (useSpainSpanish ? VOICE_MAP_ES_ES : VOICE_MAP_ES_MX);
      const refPath = map[voice]?.comfy;
      if (refPath) {
        // Buscamos un nodo que cargue audio (clase común en VibeVoice workflows o por título)
        const audioLoaderId = 
          findNodeId(workflow, "Load Audio") || 
          findNodeId(workflow, "VHS_LoadAudio") || 
          findNodeId(workflow, "LoadAudio") ||
          findNodeId(workflow, "AudioLoader") ||
          findNodeId(workflow, "VibeVoiceAudioLoader");
          
        if (audioLoaderId && workflow[audioLoaderId]?.inputs) {
          console.log(`[Omni IA Game] Inyectando referencia de audio: ${refPath} en nodo ${audioLoaderId} (${workflow[audioLoaderId]._meta?.title || workflow[audioLoaderId].class_type})`);
          // El campo suele llamarse 'audio', 'upload', 'path' o 'filename'
          for (const key of ['audio', 'path', 'upload', 'filename']) {
            if (workflow[audioLoaderId].inputs[key] !== undefined && !Array.isArray(workflow[audioLoaderId].inputs[key])) {
              workflow[audioLoaderId].inputs[key] = refPath;
              break;
            }
          }
        }
      }

      // 3. Inyección de Semilla para workflows de Voz/TTS
      const ttsSeedToUse = options?.useRandomSeed === false && options?.customSeed !== undefined
        ? options.customSeed
        : Math.floor(Math.random() * 1000000000);

      Object.entries(workflow).forEach(([id, node]: any) => {
        if (node && node.inputs) {
          if (node.inputs.seed !== undefined) node.inputs.seed = ttsSeedToUse;
          if (node.inputs.noise_seed !== undefined) node.inputs.noise_seed = ttsSeedToUse;
        }
      });



      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
      if (!invokeFn) throw new Error("Entorno no compatible con ComfyUI local");

      // El grafo ya esta montado con las MISMAS inyecciones que ComfyUI: hasta
      // aqui el recorrido ha sido identico. Con OmniDeploy solo cambia el
      // destino; el sondeo del historial de abajo no aplica porque el relay
      // devuelve el audio ya terminado. El camino de ComfyUI sigue intacto.
      if ((provider as string) === 'omnideploy') {
        const { generarConOmniDeploy } = await import('./omniDeploy');
        const salidas = await generarConOmniDeploy(
          {
            deploymentId: (settings?.audio?.ttsOmniDeployDeploymentId || '').trim(),
            apiKey: (settings?.audio?.ttsOmniDeployApiKey || '').trim(),
          },
          { prompt: processedText, tipo: 'voz', workflow, servicio: 'voz' },
        );
        const audio =
          salidas.find((s) => (s.kind ?? '') === 'audio') ??
          salidas.find((s) => /\.(wav|mp3|flac|ogg)$/i.test(s.name)) ??
          salidas[0];
        if (!audio) throw new Error('La GPU del proveedor no devolvio ningun audio.');
        const n = audio.name.toLowerCase();
        return {
          data: audio.data,
          mimeType: n.endsWith('.mp3') ? 'audio/mpeg'
            : n.endsWith('.flac') ? 'audio/flac'
            : n.endsWith('.ogg') ? 'audio/ogg'
            : 'audio/wav',
        };
      }

      console.log(`[Omni IA Game] Queuing TTS workflow with clientId: ${clientId}`, workflow);

      const result = await invokeFn('proxy_request', {
        url: `${cleanUrl}/prompt`,
        method: 'POST',
        payload: { prompt: workflow, client_id: clientId }
      });

      let data = typeof result === 'string' ? JSON.parse(result) : result;
      if (!data || !data.prompt_id) throw new Error(formatComfyError(data));
      const promptId = data.prompt_id;

      let audioFound = false;
      let attempts = 0;
      const maxAttempts = 1200; // 20 mins (VibeVoice es MUY lento en algunos casos)

      while (!audioFound && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000));
        attempts++;

        const historyResult = await invokeFn('proxy_request', {
          url: `${cleanUrl}/history/${promptId}`,
          method: 'GET'
        });
        const historyData = typeof historyResult === 'string' ? JSON.parse(historyResult) : historyResult;

        if (historyData && historyData[promptId]) {
          const outputs = historyData[promptId].outputs;
          if (outputs) {
            for (const nodeId in outputs) {
              const nodeOut = outputs[nodeId];
              if (nodeOut.audio && Array.isArray(nodeOut.audio) && nodeOut.audio.length > 0) {
                const audioObj = nodeOut.audio[0];
                if (audioObj.base64) {
                  return { data: audioObj.base64, mimeType: audioObj.type || 'audio/wav' };
                } else if (audioObj.filename) {
                  const fetchUrl = `${cleanUrl}/view?filename=${audioObj.filename}&type=${audioObj.type || 'output'}&subfolder=${audioObj.subfolder || ''}`;
                  try {
                    console.log("[Omni IA Game] Descargando audio generado de ComfyUI via Proxy para evitar CORS...");
                    const proxyResult = await invokeFn('proxy_request', {
                      url: fetchUrl,
                      method: 'GET'
                    });

                    if (typeof proxyResult === 'string' && proxyResult.startsWith('data:')) {
                      const parts = proxyResult.split(',');
                      const b64 = parts[1];
                      let finalMimeType = 'audio/flac';
                      const match = parts[0].match(/data:([^;]+);base64/);
                      if (match) {
                        finalMimeType = match[1];
                      }
                      return { data: b64, mimeType: finalMimeType };
                    } else {
                      throw new Error("El proxy de Rust no devolvió una data URL de audio válida.");
                    }
                  } catch (e: any) {
                    console.error("[Omni IA Game] Error al descargar audio de ComfyUI:", e);
                    throw new Error("No se pudo descargar el audio generado por ComfyUI.");
                  }
                }
              }
              if (nodeOut.base64) {
                return { data: nodeOut.base64, mimeType: 'audio/wav' };
              }
            }
          }
          throw new Error("ComfyUI terminó el workflow pero no produjo ningún output de audio reconocido.");
        }
      }
      throw new Error("Timeout esperando a que ComfyUI termine la generación.");
    } catch (e: any) {
      throw new Error(`Error en VibeVoice/ComfyUI: ${e.message || e}`);
    }
  } else {
    // Dynamic routing for local providers (Edge TTS)
    const baseUrl = 'http://localhost:5000';
    const mimeType = 'audio/mp3';

    let mappedVoice = 'es-MX-DaliaNeural';

    const map = lang === 'EN' ? VOICE_MAP_EN : (useSpainSpanish ? VOICE_MAP_ES_ES : VOICE_MAP_ES_MX);
    mappedVoice = map[voice]?.local || (lang === 'EN' ? 'en-US-JennyNeural' : 'es-MX-DaliaNeural');

    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

    if (invokeFn) {
      console.log("[Omni IA Game] On-Demand: Encendiendo Edge TTS...");
      // EL ERROR NO SE TRAGA. Iba a `console.error` y el usuario solo veia el
      // timeout de 15 s, que es el sintoma y no la causa: si `spawn` falla por
      // permisos o por falta de Python, hay que decirlo con esas palabras.
      let motivoLanzamiento: string | null = null;
      await invokeFn('launch_edge_tts').catch((e: any) => {
        motivoLanzamiento = typeof e === 'string' ? e : e?.message || String(e);
        console.error('Error al lanzar Edge TTS:', e);
      });

      // Polling: Esperar hasta 15 segundos a que el puerto 5000 responda
      let isReady = false;
      for (let i = 0; i < 15; i++) {
        const isActive = await invokeFn('check_service_status', { url: 'http://localhost:5000/api/voices' }).catch(() => false);
        if (isActive) {
          isReady = true;
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!isReady) {
        // Asegurar que lo apagamos si falló para no dejar basura
        await invokeFn('stop_edge_tts').catch(() => null);
        throw new Error(
          motivoLanzamiento
            ? `Edge TTS no pudo iniciar: ${motivoLanzamiento}`
            : 'Edge TTS no pudo iniciar a tiempo (15 s). Comprueba que Python y edge-tts estén instalados.',
        );
      }
    }

    try {
      console.log(`[Omni IA Game] Edge TTS Request: Voice=${mappedVoice} | Text=${text.substring(0, 30)}...`);
      // POR EL PROXY NATIVO, no por `fetch`. Empaquetada, la interfaz corre en
      // Sanitizador exclusivo para Edge TTS: elimina etiquetas de guión [Acción], [Contexto], ES:, EN:, etc.
      const edgeCleanText = text
        .replace(/\[[^\]]+\]:?/g, '')
        .replace(/\([^)]+\):?/g, '')
        .replace(/\b(ES|EN|Voiceover|Narrator):?/gi, '')
        .replace(/Diálogo\s*\/\s*Narrativa Dual:?/gi, '')
        .replace(/Escena:?/gi, '')
        .replace(/\n\s*\n+/g, '\n')
        .trim();

      const data = await enviarJsonLocal(`${baseUrl}/api/tts`, { text: edgeCleanText || text, voice: mappedVoice });
      if (!data?.audio) {
        throw new Error(data?.error || 'TTS local falló en la generación.');
      }
      return { data: data.audio, mimeType: mimeType };
    } finally {
      if (invokeFn) {
        console.log("[Omni IA Game] On-Demand: Apagando Edge TTS (Limpieza)...");
        await invokeFn('stop_edge_tts').catch((e: any) => console.error("Error al detener Edge TTS:", e));
      }
    }
  }
  } finally {
    await releasePostGenerationMemory(provider, settings, voice);
  }
};

// Audio Music / SFX
export const generateAtmosphere = async (
  prompt: string,
  settings?: ProjectData['apiSettings'],
  isSfx: boolean = false,
  durationSeconds?: number,
  options?: {
    lyrics?: string;
    language?: string;
    isInstrumental?: boolean;
    genre?: string;
    style?: string;
    singerGender?: string | null;
    title?: string;
    useRandomSeed?: boolean;
    customSeed?: number;
  }
): Promise<string | Blob> => {
  const provider = settings?.audio?.musicProvider || 'local';
  const apiKey = settings?.audio?.apiKeys?.[provider] || settings?.audio?.apiKey;
  const musicModel = isSfx ? 'sfx_model' : 'music_model';

  // Orquestación inteligente de memoria VRAM / RAM
  await ensureExclusiveMemoryContext(provider, musicModel, isSfx ? 'sfx' : 'music', settings);

  try {
    const baseUrl = isSfx
      ? (settings?.audio?.sfxUrl || 'http://127.0.0.1:8188')
      : (settings?.audio?.musicUrl || 'http://127.0.0.1:8188');

    if (provider === 'comfydeploy') {
    const cdApiKey = isSfx ? settings?.audio?.sfxComfyDeployApiKey : settings?.audio?.musicComfyDeployApiKey;
    const cdDepId = isSfx ? settings?.audio?.sfxComfyDeployDeploymentId : settings?.audio?.musicComfyDeployDeploymentId;
    return await generateLocalAudio(
      cdDepId || 'comfydeploy',
      prompt,
      cdApiKey,
      'comfydeploy'
    );
  }

  if (provider === 'gemini') {
    return await geminiAtmosphere(prompt, apiKey, isSfx);
  } else if (provider === 'comfyui' || (provider as string) === 'omnideploy') {
    // OmniDeploy prepara el grafo igual que ComfyUI —incluida la inyeccion de
    // duracion, letras y genero— y solo cambia a donde se envia, mas abajo.
    // Con OmniDeploy el grafo lo pone el proveedor: el cliente solo escribe sus
    // credenciales. Con ComfyUI local, el que el usuario tiene cargado.
    let customWorkflowJson = isSfx ? settings?.audio?.sfxCustomWorkflow : settings?.audio?.musicCustomWorkflow;
    const odId = isSfx ? settings?.audio?.sfxOmniDeployDeploymentId : settings?.audio?.musicOmniDeployDeploymentId;
    const odKey = isSfx ? settings?.audio?.sfxOmniDeployApiKey : settings?.audio?.musicOmniDeployApiKey;
    if ((provider as string) === 'omnideploy') {
      if (!odId?.trim() || !odKey?.trim()) {
        throw new Error(
          `Falta el Deployment ID o la API Key de OmniDeploy para ${isSfx ? 'los efectos' : 'la musica'}. Pegalos en Ajustes.`,
        );
      }
      const grafo = await pedirWorkflowDelProveedor(
        { deploymentId: odId.trim(), apiKey: odKey.trim() },
        isSfx ? 'sfx' : 'musica',
      );
      customWorkflowJson = JSON.stringify(grafo);
    }
    const modelNodeName = isSfx ? settings?.audio?.sfxModel : settings?.audio?.musicModel;

    if (!customWorkflowJson) {
      throw new Error(`ComfyUI ${isSfx ? 'SFX' : 'Música'} requiere un Workflow JSON cargado en la Configuración.`);
    }

    try {
      const workflow = JSON.parse(customWorkflowJson);
      const clientId = isSfx ? `omni_ia_game_sfx_${Date.now()}` : `omni_ia_game_music_${Date.now()}`;
      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

      const findNodeId = (wf: any, classType: string, title?: string) => {
        if (title) {
          const found = Object.entries(wf).find(([_, n]: any) => n._meta?.title === title);
          if (found) return found[0];
        }
        const found = Object.entries(wf).find(([_, n]: any) => n.class_type === classType);
        return found ? found[0] : null;
      };

      // 1. Inyección de Género y Voz en nodos de cantante/voz
      const singerGender = options?.singerGender;
      const lyrics = options?.lyrics;
      const language = options?.language;
      const isInstrumental = options?.isInstrumental;
      const genre = options?.genre;
      const style = options?.style;

      if (!isSfx && singerGender) {
        const voiceNodes = Object.entries(workflow).filter(([_, n]: any) => {
          const title = (n._meta?.title || '').toLowerCase();
          const classType = (n.class_type || '').toLowerCase();
          return title.includes('singer') || title.includes('cantante') ||
                 title.includes('voice') || title.includes('voz') ||
                 title.includes('speaker') || title.includes('vocalist') ||
                 classType.includes('singer') || classType.includes('vocalist') ||
                 classType.includes('speaker');
        });

        console.log(`[Omni IA Game] Encontrados ${voiceNodes.length} nodos de voz/cantante para analizar.`);

        voiceNodes.forEach(([nodeId, node]: any) => {
          if (node.inputs) {
            for (const key in node.inputs) {
              const val = node.inputs[key];
              if (typeof val === 'string') {
                const valLower = val.toLowerCase();
                if (singerGender === 'female') {
                  if (valLower.includes('male')) {
                    node.inputs[key] = val.replace(/male/gi, 'female');
                    console.log(`[Omni IA Game] Reemplazado 'male' por 'female' en nodo "${nodeId}" (${key}): ${node.inputs[key]}`);
                  } else if (valLower.includes('man') && !valLower.includes('woman')) {
                    node.inputs[key] = val.replace(/man/gi, 'female');
                    console.log(`[Omni IA Game] Reemplazado 'man' por 'female' en nodo "${nodeId}" (${key}): ${node.inputs[key]}`);
                  } else if (valLower === 'male' || valLower === 'hombre') {
                    node.inputs[key] = 'female';
                    console.log(`[Omni IA Game] Forzado a 'female' en nodo "${nodeId}" (${key})`);
                  }
                } else if (singerGender === 'male') {
                  if (valLower.includes('female')) {
                    node.inputs[key] = val.replace(/female/gi, 'male');
                    console.log(`[Omni IA Game] Reemplazado 'female' por 'male' en nodo "${nodeId}" (${key}): ${node.inputs[key]}`);
                  } else if (valLower.includes('woman')) {
                    node.inputs[key] = val.replace(/woman/gi, 'male');
                    console.log(`[Omni IA Game] Reemplazado 'woman' por 'male' en nodo "${nodeId}" (${key}): ${node.inputs[key]}`);
                  } else if (valLower === 'female' || valLower === 'mujer') {
                    node.inputs[key] = 'male';
                    console.log(`[Omni IA Game] Forzado a 'male' en nodo "${nodeId}" (${key})`);
                  }
                }
              }
            }
          }
        });
      }

      // 2. Inyección de Texto inteligente (evaluando CLIPTextEncode y nodos directos como MMAudioSampler, FetchSFX)
      // Identificar nodos de condicionamiento negativo (conectados a la entrada "negative" de KSamplers)
      const negativeNodeIds = new Set<string>();
      Object.entries(workflow).forEach(([nodeId, n]: [string, any]) => {
        if (n && n.inputs) {
          if (Array.isArray(n.inputs.negative) && n.inputs.negative.length > 0) {
            negativeNodeIds.add(n.inputs.negative[0].toString());
          }
        }
      });

      const textNodes = Object.entries(workflow).filter(([nodeId, n]: any) => {
        if (negativeNodeIds.has(nodeId)) return false;

        const classType = (n.class_type || '').toLowerCase();
        const title = (n._meta?.title || '').toLowerCase();

        if (title.includes('negative') || title.includes('negativo') || title.includes('bad') || title.includes('nocivo')) return false;

        // Evaluar nodos que tengan directamente algún campo de prompt de entrada
        if (n.inputs) {
          for (const key of ['prompt', 'search_query', 'text', 'string', 'text_input']) {
            if (n.inputs[key] !== undefined && key !== 'negative_prompt') {
              return true;
            }
          }
        }

        return classType === 'cliptextencode' || 
               classType === 'cliptextencodeselect' ||
               classType.includes('textencode') ||
               classType.includes('cliptext') ||
               classType.includes('sampler') ||
               title.includes('text') ||
               title.includes('prompt') ||
               title.includes('lyrics') ||
               title.includes('letra') ||
               title.includes('query') ||
               title.includes('search');
      });

      console.log(`[Omni IA Game] Encontrados ${textNodes.length} nodos de texto para evaluar inyección.`);

      let injectedAny = false;

      textNodes.forEach(([nodeId, node]: any) => {
        const title = (node._meta?.title || '').toLowerCase();
        const inputs = node.inputs || {};
        
        const isLyricsOrVocalsNode = title.includes('lyrics') || 
                                     title.includes('vocals') || 
                                     title.includes('singer') || 
                                     title.includes('cantante') ||
                                     title.includes('letra') ||
                                     title.includes('vocal');

        const isStyleOrMusicNode = title.includes('style') || 
                                   title.includes('music') || 
                                   title.includes('instrumental') || 
                                   title.includes('acompañamiento') ||
                                   title.includes('genero') ||
                                   title.includes('gênero') ||
                                   title.includes('genre');

        let promptToInject = '';
        if (isLyricsOrVocalsNode) {
          const parts: string[] = [];
          if (language) parts.push(`[Language: ${language}]`);
          if (singerGender) parts.push(`[Singer: ${singerGender}]`);
          if (lyrics) parts.push(lyrics);
          promptToInject = parts.join('\n');
        } else if (isStyleOrMusicNode) {
          const parts: string[] = [];
          parts.push(`[${isInstrumental ? 'Instrumental only, no vocals, no singing' : 'Vocal'}]`);
          if (!isInstrumental && singerGender) {
            parts.push(singerGender === 'female' ? 'female vocalist' : 'male vocalist');
          }
          if (genre) parts.push(`Genre: ${genre}`);
          if (style) parts.push(`Style: ${style}`);
          parts.push(prompt);
          promptToInject = parts.join(', ');
        } else {
          promptToInject = prompt;
        }

        for (const key of ['prompt', 'search_query', 'text', 'string', 'text_input']) {
          if (inputs[key] !== undefined && key !== 'negative_prompt') {
            inputs[key] = promptToInject;
            injectedAny = true;
            console.log(`[Omni IA Game] Inyectado en nodo de texto "${nodeId}" (${node._meta?.title || node.class_type}) campo "${key}": ${promptToInject.substring(0, 50)}...`);
            break;
          }
        }
      });

      if (!injectedAny) {
        const targetNodeId = modelNodeName 
          ? findNodeId(workflow, modelNodeName, modelNodeName) 
          : findNodeId(workflow, 'CLIPTextEncode');

        if (targetNodeId && workflow[targetNodeId] && workflow[targetNodeId].inputs) {
          let injected = false;
          for (const key of ['prompt', 'search_query', 'text', 'string', 'text_input']) {
            if (workflow[targetNodeId].inputs[key] !== undefined && key !== 'negative_prompt') {
              workflow[targetNodeId].inputs[key] = prompt;
              injected = true;
              break;
            }
          }
          if (!injected) {
            for (const key in workflow[targetNodeId].inputs) {
              if (typeof workflow[targetNodeId].inputs[key] === 'string' && key !== 'negative_prompt') {
                workflow[targetNodeId].inputs[key] = prompt;
                injected = true;
                break;
              }
            }
          }
          console.log(`[Omni IA Game] Inyección de fallback realizada en nodo "${targetNodeId}"`);
        }
      }

      // 3. Manejo de Semilla (Aleatoria vs Fija)
      const useRandomSeed = options?.useRandomSeed !== false;
      const targetSeed = useRandomSeed 
        ? Math.floor(Math.random() * 1000000000000000)
        : (typeof options?.customSeed === 'number' ? options.customSeed : undefined);

      if (targetSeed !== undefined) {
        let seedInjectedCount = 0;
        Object.entries(workflow).forEach(([nodeId, node]: [string, any]) => {
          if (node && node.inputs) {
            for (const key of ['seed', 'noise_seed']) {
              if (node.inputs[key] !== undefined) {
                node.inputs[key] = targetSeed;
                seedInjectedCount++;
                console.log(`[Omni IA Game] Semilla (${useRandomSeed ? 'Aleatoria' : 'Fija'}: ${targetSeed}) inyectada en nodo "${nodeId}" (${node._meta?.title || node.class_type}) campo "${key}"`);
              }
            }
          }
        });
        console.log(`[Omni IA Game] Inyección de semilla completada en ${seedInjectedCount} campo(s).`);
      }

      // 4. Inyección de duración masiva en todos los nodos que tengan campos de duración o segundos
      if (durationSeconds && durationSeconds > 0) {
        let durationInjectedCount = 0;
        
        Object.entries(workflow).forEach(([nodeId, node]: [string, any]) => {
          if (node && node.inputs) {
            for (const key of ['duration', 'seconds', 'duracion', 'duración', 'seconds_to_generate', 'duration_seconds', 'max_duration']) {
              if (node.inputs[key] !== undefined) {
                const currentValue = node.inputs[key];
                
                // Si el input es un enlace a otro nodo constante/primitivo (ej: ["15", 0]), seguimos el enlace para actualizar el nodo origen
                if (Array.isArray(currentValue) && currentValue.length === 2) {
                  const linkedNodeId = currentValue[0];
                  const linkedNode = workflow[linkedNodeId];
                  if (linkedNode && linkedNode.inputs && linkedNode.inputs.value !== undefined) {
                    linkedNode.inputs.value = durationSeconds;
                    durationInjectedCount++;
                    console.log(`[Omni IA Game] Duración inyectada en nodo constante enlazado "${linkedNodeId}" (desde nodo "${nodeId}" campo "${key}"): ${durationSeconds}s`);
                  }
                }
                
                // Siempre sobreescribimos directamente en el nodo principal para asegurar que ambos valores sean sobreescritos directamente en el JSON
                node.inputs[key] = durationSeconds;
                durationInjectedCount++;
                console.log(`[Omni IA Game] Duración inyectada directamente: ${durationSeconds}s en nodo "${nodeId}" campo "${key}"`);
              }
            }
          }
        });

        if (durationInjectedCount === 0) {
          console.warn(`[Omni IA Game] No se encontró ningún campo de duración en el workflow.`);
        } else {
          console.log(`[Omni IA Game] Inyección de duración completada con éxito en ${durationInjectedCount} campos.`);
        }
      }

      // Grafo listo, con duracion y letras ya inyectadas. OmniDeploy lo manda a
      // la GPU del proveedor; ComfyUI sigue por su camino de siempre.
      if ((provider as string) === 'omnideploy') {
        const { generarConOmniDeploy, salidaADataUrl } = await import('./omniDeploy');
        const salidas = await generarConOmniDeploy(
          { deploymentId: odId!.trim(), apiKey: odKey!.trim() },
          { prompt, tipo: isSfx ? 'sfx' : 'musica', workflow, servicio: isSfx ? 'sfx' : 'musica' },
        );
        const audio =
          salidas.find((s) => (s.kind ?? '') === 'audio') ??
          salidas.find((s) => /\.(wav|mp3|flac|ogg)$/i.test(s.name)) ??
          salidas[0];
        if (!audio) throw new Error('La GPU del proveedor no devolvio ningun audio.');
        return salidaADataUrl(audio);
      }

      if (invokeFn) {
        const result = await invokeFn('proxy_request', {
          url: `${baseUrl.replace(/\/$/, '')}/prompt`,
          method: 'POST',
          payload: { prompt: workflow, client_id: clientId }
        });

        const data = typeof result === 'string' ? JSON.parse(result) : result;
        if (!data || !data.prompt_id) throw new Error(formatComfyError(data));

        const promptId = data.prompt_id;
        for (let i = 0; i < 1800; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const histResult = await invokeFn('proxy_request', {
            url: `${baseUrl.replace(/\/$/, '')}/history/${promptId}`,
            method: 'GET'
          });
          const histData = typeof histResult === 'string' ? JSON.parse(histResult) : histResult;

          if (histData[promptId] && histData[promptId].outputs) {
            const outputs = histData[promptId].outputs;
            for (const nodeId of Object.keys(outputs)) {
              if (outputs[nodeId].audio && outputs[nodeId].audio.length > 0) {
                const audioFile = outputs[nodeId].audio[0];
                const finalAudioUrl = await invokeFn('proxy_request', {
                  url: `${baseUrl.replace(/\/$/, '')}/view?filename=${audioFile.filename}&subfolder=${audioFile.subfolder || ''}&type=${audioFile.type || 'output'}`,
                  method: 'GET'
                });
                return finalAudioUrl;
              }
            }
          }
        }
        throw new Error(`Timeout en la generación de ${isSfx ? 'SFX' : 'música'}.`);
      }
      throw new Error("La integración con ComfyUI requiere el entorno de escritorio (Tauri).");
    } catch (e: any) {
      throw new Error(`Error en ComfyUI ${isSfx ? 'SFX' : 'Música'}: ${e.message || e}`);
    }
    } else {
      return await generateLocalAudio(baseUrl, prompt, apiKey, provider, {
        lyrics: options?.lyrics,
        language: options?.language,
        isInstrumental: options?.isInstrumental,
        genre: options?.genre,
        style: options?.style,
        title: options?.title
      });
    }
  } finally {
    await releasePostGenerationMemory(provider, settings, musicModel);
  }
};
const decodeEscapeSequences = (str: string): string => {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
};

const extractFieldValue = (jsonStr: string, fieldName: string, nextFieldName?: string): string => {
  const keyRegex = new RegExp(`"${fieldName}"\\s*:\\s*"`, 'i');
  const match = jsonStr.match(keyRegex);
  if (!match || match.index === undefined) return '';
  const startIndex = match.index + match[0].length;
  const remaining = jsonStr.slice(startIndex);

  if (nextFieldName) {
    const nextRegex = new RegExp(`"\\s*,\\s*"${nextFieldName}"\\s*:`, 'i');
    const nextMatch = remaining.match(nextRegex);
    if (nextMatch && nextMatch.index !== undefined) {
      return decodeEscapeSequences(remaining.slice(0, nextMatch.index).trim());
    }
  }

  // Look for closing quote before ending brace, e.g. " } or "}
  const endMatch = remaining.match(/"\s*}\s*$/);
  if (endMatch && endMatch.index !== undefined) {
    return decodeEscapeSequences(remaining.slice(0, endMatch.index).trim());
  }

  // If ending brace has no quote before it or trailing characters:
  return decodeEscapeSequences(remaining.replace(/["}\s]+$/, '').trim());
};

const robustJSONParse = (raw: string): { positive?: string; negative?: string } => {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { positive: "", negative: "" };
  }

  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<thought>[\s\S]*/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  if (!cleaned) {
    return { positive: "", negative: "" };
  }

  const formatValue = (val: any): string => {
    if (val === undefined || val === null) return "";
    if (typeof val === 'string') return val.trim();
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean).join(', ');
    if (typeof val === 'object') return Object.values(val).map(v => String(v).trim()).filter(Boolean).join(', ');
    return String(val).trim();
  };

  // 1. Intento con JSON.parse nativo tolerante a variantes de claves
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const posVal = obj.positive 
        ?? obj.positive_keywords 
        ?? obj.positive_prompt 
        ?? obj.prompt 
        ?? obj.positivePrompt 
        ?? obj.refined_prompt 
        ?? obj.output 
        ?? obj.result;
      const negVal = obj.negative 
        ?? obj.negative_keywords 
        ?? obj.negative_prompt 
        ?? obj.negativePrompt 
        ?? obj.negative_exclusions 
        ?? obj.exclusions 
        ?? "";

      if (posVal !== undefined || negVal !== undefined) {
        const posStr = formatValue(posVal);
        const negStr = formatValue(negVal);
        if (posStr || negStr) {
          return { positive: posStr, negative: negStr };
        }
      }
    }
  } catch (parseError) {
    console.warn("[Omni IA Game] Standard JSON.parse falló, aplicando extracción heurística tolerante a fallos...", parseError);
  }

  // 2. Extracción heurística tolerante a comillas dobles internas y claves variantes
  const positiveKeys = ['positive', 'positive_keywords', 'positive_prompt', 'prompt', 'positivePrompt', 'refined_prompt', 'output', 'result'];
  const negativeKeys = ['negative', 'negative_keywords', 'negative_prompt', 'negativePrompt', 'negative_exclusions', 'exclusions'];

  let positive = '';
  for (const pKey of positiveKeys) {
    for (const nKey of negativeKeys) {
      positive = extractFieldValue(cleaned, pKey, nKey);
      if (positive) break;
    }
    if (positive) break;
    positive = extractFieldValue(cleaned, pKey);
    if (positive) break;
  }

  let negative = '';
  for (const nKey of negativeKeys) {
    negative = extractFieldValue(cleaned, nKey);
    if (negative) break;
  }

  // Fallback con regex estándar si la extracción por fronteras no capturó
  if (!positive) {
    const posRegex = /"(?:positive|positive_keywords|positive_prompt|prompt|positivePrompt|refined_prompt|output|result)"\s*:\s*(?:"([\s\S]*?)(?:"\s*,\s*"(?:negative|negative_keywords|negative_prompt|negativePrompt|negative_exclusions|exclusions)"|"\s*}|"\s*$|$)|\[([\s\S]*?)\])/i;
    const posMatch = cleaned.match(posRegex);
    if (posMatch) {
      if (posMatch[1]) {
        positive = decodeEscapeSequences(posMatch[1].trim());
      } else if (posMatch[2]) {
        positive = posMatch[2].replace(/"/g, '').split(',').map(s => s.trim()).filter(Boolean).join(', ');
      }
    }
  }

  if (!negative) {
    const negRegex = /"(?:negative|negative_keywords|negative_prompt|negativePrompt|negative_exclusions|exclusions)"\s*:\s*(?:"([\s\S]*?)(?:"\s*}|"\s*$|$)|\[([\s\S]*?)\])/i;
    const negMatch = cleaned.match(negRegex);
    if (negMatch) {
      if (negMatch[1]) {
        negative = decodeEscapeSequences(negMatch[1].trim());
      } else if (negMatch[2]) {
        negative = negMatch[2].replace(/"/g, '').split(',').map(s => s.trim()).filter(Boolean).join(', ');
      }
    }
  }

  if (positive || negative) {
    return { positive, negative };
  }

  // 3. Si el modelo devolvió texto plano sin formato JSON
  if (cleaned.length > 0 && !cleaned.startsWith('{')) {
    return { positive: cleaned, negative: "" };
  }

  return { positive: cleaned, negative: "" };
};

export const refinePrompt = async (
  userIdea: string,
  style: string,
  mode: 'sprite' | 'background' | 'animation' | 'sfx' | 'music' | 'narrative' | 'code' | '3d',
  action: string,
  currentNegative: string,
  settings?: ProjectData['apiSettings'],
  extraContext?: any,
  signal?: AbortSignal
): Promise<{ positive: string; negative: string }> => {
  const pe = settings?.promptEngineer;
  if (!pe?.enabled) throw new Error("Prompt Engineer no está habilitado.");

  const isCustomSceneMode = extraContext?.useBasicBackgrounds === false && !extraContext?.removeBgInWorkflow && !extraContext?.autoRemoveBackground;
  const useBasicBackgrounds = !isCustomSceneMode;
  const isChromaBg = useBasicBackgrounds && Boolean(extraContext?.useChromaKeyGreen || extraContext?.spriteBgMode === 'chromakey' || extraContext?.spriteBgMode === 'chroma');

  let systemPrompt = '';
  let userMessage = '';

  if (mode === 'animation') {
    systemPrompt = `You are a world-class video game animation and cinematic director specialized in visual media.
Transform the user's animation idea into a highly detailed visual prompt for a text-to-video / keyframe model.

RULES:
1. Describe the keyframe visual details and the cinematic movement in technical terms (camera panning, tilt, zoom, motion pacing, fluid dynamics, lighting transitions, frame stability).
2. Specify the artistic style "${style}" precisely. Use style-appropriate descriptive keywords in your prompt text.
3. For walk cycles or movement sequences, describe harmonious, fluid, and natural body mechanics. Mandate synchronized arm swings, coordinated foot strides, hip rotation, and natural weight shifts, explicitly detailing active motion for BOTH hands and feet to avoid stiff limbs.
4. Positive prompt must be in ENGLISH (image/video AI models work best with English).
5. Negative prompt must be a tailored, high-quality negative prompt in ENGLISH. It must dynamically incorporate:
   a) Contextual exclusions based on the artistic style selected ("style", e.g., if Pixel Art, exclude "3D render, photorealistic, high-poly, smooth shading, gradient, blurry background"; if 3D style, exclude "2D, flat shading, pixelated, hand-drawn, low-poly").
   b) Video/animation anomalies specific to the action, movement type, and prompt context (e.g., stuttering, morphing, body distortions, extra limbs, sudden cuts, frame jumps, floating artifacts, jittering, limbs getting stuck, static arms).
   c) The user's current negative terms as a foundational base.
6. CRITICAL OUTPUT FORMAT: Output must be strictly a raw JSON object with exactly two keys: "positive" and "negative". Do NOT use "positive_keywords", "negative_keywords", or include "thought" / "prompt_construction" objects. No markdown code blocks.

Example Output format:
{"positive": "epic camera pan across a pixel art volcanic dungeon...", "negative": "low quality, text, blurry, 3D render, photorealistic..."}`;

    userMessage = `Style: ${style}
Animation Type: ${action}
Current Negative: ${currentNegative}
Visual Animation Idea: ${userIdea}

Generate the professional prompts in JSON format:`;

  } else if (mode === 'sfx') {
    const isSoundscape = !!extraContext?.isSoundscape;
    systemPrompt = `You are a professional audio designer and foley artist for high-end video games.
Transform a simple sound description into a highly detailed acoustic generation prompt.

RULES:
1. Describe the sound's physical properties, materials, environment acoustic texture, distance from the microphone, reverberation, and frequency details.
2. If this is a Soundscape (isSoundscape is True), design a continuous, rich environmental atmosphere (nature, humming, soundscape). Forbid instruments and musical notes.
3. If this is a standard SFX (isSoundscape is False), design a crisp, single, isolated sound effect (footstep, explosion, sword swing).
4. The positive prompt must be in ENGLISH.
5. Create a specific negative prompt to exclude unwanted sounds (hum, hiss, vocals if instrumental, distortion, musical instruments if natural, beep).
6. Output format must be raw JSON with "positive" and "negative" keys. No markdown, no \`\`\`json blocks.

Example Output format:
{"positive": "crisp high-fidelity recording of a heavy stone door grinding open...", "negative": "music, hum, hiss, digital clipping..."}`;

    userMessage = `Category: SFX
Is Soundscape: ${isSoundscape ? 'Yes' : 'No'}
BPM: ${extraContext?.bpm || 'N/A'}
Current Negative: ${currentNegative}
Sound Idea: ${userIdea}

Generate the professional prompts in JSON format:`;

  } else if (mode === 'music') {
    const isInstrumental = !!extraContext?.isInstrumental;
    const refineLyrics = !!extraContext?.refineLyrics;

    if (refineLyrics) {
      const langCode = (extraContext?.language || 'ES').toUpperCase();
      const langMap: Record<string, string> = {
        'ES': 'SPANISH (Español)',
        'EN': 'ENGLISH',
        'IT': 'ITALIAN (Italiano)',
        'FR': 'FRENCH (Français)',
        'DE': 'GERMAN (Deutsch)',
        'PT': 'PORTUGUESE (Português)',
        'JA': 'JAPANESE (Romaji/Japanese)',
      };
      const targetLanguage = langMap[langCode] || `the language with code "${langCode}"`;

      const singerGender = extraContext?.singerGender || '';
      let vocalDirective = '';
      if (singerGender === 'duet') {
        vocalDirective = `VOCAL STRUCTURE: THIS SONG IS A DUET FOR MALE AND FEMALE VOICES. You MUST explicitly structure the lyrics with alternating sections and vocal tags:
- Use tags like [Vocalista Masculino] / [Male Voice] for the male singer's verses.
- Use tags like [Vocalista Femenino] / [Female Voice] for the female singer's verses.
- Use tags like [Dúo / Ambos] / [Duet / Both] for the shared chorus and emotional highlights.`;
      } else if (singerGender === 'male') {
        vocalDirective = `VOCAL STRUCTURE: Designed for a MALE lead vocalist ([Vocalista Masculino] / [Male Lead]).`;
      } else if (singerGender === 'female') {
        vocalDirective = `VOCAL STRUCTURE: Designed for a FEMALE lead vocalist ([Vocalista Femenino] / [Female Lead]).`;
      } else {
        vocalDirective = `VOCAL STRUCTURE: Adapt vocal arrangement to best fit the theme and genre.`;
      }

      systemPrompt = `You are a master lyricist, bohemian poet, and world-class songwriter for video game soundtracks and commercial music.
Your task is to take the user's music theme ("${extraContext?.musicDescription || userIdea || 'Epic song'}") and current lyrics seed, and craft complete, highly poetic, original, and deeply emotional lyrics.

TARGET LANGUAGE: Write 100% strictly in ${targetLanguage}.

GENRE & STYLE LYRICAL GUIDE:
- Ambient: Sparse, abstract, atmospheric metaphors, meditative pauses.
- Cinematic: Epic, narrative-driven, high stakes, dramatic storytelling.
- Electronic: Repetitive, punchy, rhythmic hooks, futuristic or high-energy themes.
- Rock: Raw, rebellious, energetic, anthemic choruses, direct emotional impact.
- Jazz: Storytelling, smooth, syncopated rhythm phrasing, clever wordplay, sophisticated metaphors.
- Classical: Poetic, operatic, sonnet-like structure, formal vocabulary.
- Hip-Hop: Rhythmic rhymes, fast pacing, urban storytelling, clever punchlines.
- Pop: Bright, catchy, radio-friendly, highly relatable hooks, clear chorus, memorable melodies.
- Balada / Balada Romántica: Deeply emotional, passionate, romantic or nostalgic storytelling, poetic vulnerability, slow-tempo pacing, soaring and expressive chorus expressing longing, love, or hope.

${vocalDirective}

RULES:
1. Write well-structured verses ([Verso 1], [Verso 2]), a memorable chorus ([Estribillo]), bridge ([Puente]), and outro ([Outro]).
2. Match the mood of the genre "${extraContext?.genre || 'N/A'}" and style "${style || 'N/A'}".
3. Write 100% strictly in ${targetLanguage}.
4. Output format must be raw JSON with a single key "positive" containing the generated lyrics. Set the "negative" key to empty string. No markdown, no \`\`\`json blocks.
5. CRITICAL: Never include raw unescaped double quotes inside your string values (e.g. write 'yo' or \"yo\") to ensure the JSON is valid and parsable.`;

      userMessage = `Music Theme / Concept: ${extraContext?.musicDescription || userIdea || 'General Song'}
Genre: ${extraContext?.genre || 'N/A'}
Style: ${style || 'N/A'}
Language: ${targetLanguage}
Singer Gender: ${singerGender || 'N/A'}
Current Lyrics Seed / Concept: ${userIdea || 'None (generate complete song from theme)'}

Generate the professional lyrics in JSON format:`;
    } else {
      systemPrompt = `You are a professional music producer and composer for cinematic video games.
Transform a simple music concept into a highly detailed music generation prompt.

GENRE & STYLE SOUND GUIDE:
- Ambient: Sparse textures, sweeping synth pads, deep drones, lush reverb, minimal slow-attack percussion.
- Cinematic: Orchestral dynamics, string staccatos, sweeping brass, hybrid impacts, epic crescendo structures.
- Electronic: High-energy synthesizers, sidechain compression, 4x4 or syncopated drum machine beats, crisp arpeggios, white noise sweeps.
- Rock: Distorted electric guitars, heavy acoustic drums, driving bass lines, raw energetic acoustic space.
- Jazz: Syncopated swing rhythms, acoustic upright bass, clean piano chords (7ths, 9ths), expressive brass, intimate club acoustics.
- Classical: Concert hall reverberation, acoustic violins, grand piano, classical harmony, dynamic expression.
- Hip-Hop: Heavy sub-bass (808s), punchy snare, crisp syncopated hi-hats, vinyl crackle, looped instrumental hooks.
- Orchestral: Full acoustic symphony orchestra, strings, brass, woodwinds, acoustic percussion, cinematic concert hall depth.
- Pop: Polished modern production, bright synthesizer leads, catchy melodic hooks, crisp present vocals, danceable rhythm.
- Balada / Balada Romántica: Slow to mid-tempo, grand piano or acoustic guitar foundation, expressive intimate vocals (if not instrumental), lush string pads, gentle acoustic percussion, and dramatic emotional build-ups.

RULES:
1. Detail the instrumentation, layers, production quality (analogue synth, grand piano, strings, studio master mix), emotional texture, tempo, and key modulations matching the GENRE & STYLE SOUND GUIDE.
2. Support isInstrumental: ${isInstrumental ? 'True (strictly instrumental, no vocals, no singing)' : 'False (vocals allowed)'}.
3. Incorporate genre: ${extraContext?.genre || 'N/A'} and style: ${style}.
4. The prompt must be in ENGLISH.
5. Create a specific negative prompt to exclude unwanted production elements (distortion, vocals if instrumental, flat drums, robotic speech, clipping).
6. Output format must be raw JSON with "positive" and "negative" keys. No markdown, no \`\`\`json blocks.
7. CRITICAL: Never include raw unescaped double quotes inside your string values (e.g. "chorus" must be written as \"chorus\" or 'chorus') to ensure the JSON is valid and parsable.

Example Output format:
{"positive": "slow atmospheric synthwave track with analog filters...", "negative": "vocals, singing, high distortion..."}`;

      userMessage = `Category: Music
Genre: ${extraContext?.genre || 'N/A'}
Style: ${style}
Singer Gender: ${extraContext?.singerGender || 'N/A'}
Is Instrumental: ${isInstrumental ? 'Yes' : 'No'}
Lyrics (if any): ${extraContext?.lyrics || 'None'}
Current Negative: ${currentNegative}
Music Idea: ${userIdea}

Generate the professional prompts in JSON format:`;
    }

  } else if (mode === 'narrative') {
    systemPrompt = `You are an award-winning Lead Narrative Designer and Creative Director for AAA video games (on par with Neil Druckmann, Hideo Kojima, Sam Lake, Ken Levine, and Hidetaka Miyazaki).
Your task is to take a simple story, dialogue, or script seed and refine it into an original, world-class narrative concept and game prompt.

CREATIVE DIRECTIVE & ANTI-CLICHÉ RULES:
1. STRICTLY FORBIDDEN to use generic AI title clichés such as "Ecos de...", "Sombras de...", "El Despertar de...", "Las Cenizas de...", "Crónicas de...", "El Destino de...".
2. Invent unique, punchy, high-impact titles specifically tailored to the user's seed topic (e.g. "NEON VELOCITY: OVERDRIVE", "VECTOR CERO", "SIGNAL LOST", "PROTOCOLO SILENCIO", "DISRUPT", "STATIC SOULS").
3. Expand the user's seed into a deeply immersive narrative concept with rich character motivations, atmospheric worldbuilding, vivid action descriptions, and authentic cinematic dialogue.
4. The entire output must be STRICTLY 100% IN SPANISH ONLY.
5. ABSOLUTELY FORBIDDEN to include language prefixes (like "ES:", "EN:", "Spanish:", "English:"), dual translations, or markdown formatting.
6. Output format must be raw JSON with a single key "positive" containing the refined Spanish narrative concept. Set the "negative" key to empty string. No markdown code blocks, no \`\`\`json.

Example Output:
{"positive": "Título del Proyecto: NEON VELOCITY: OVERDRIVE\\nGénero: Sci-Fi Tactical Runner\\nContexto Narrativo: En el año 2088, el Protocolo de Movilidad Cero ha sofocado Nueva Éxodo. Jax desafía los drones patrulla con una tabla cinética para transportar Data-Cores con las memorias libres de los ciudadanos...\\nEscena de Introducción: El Distrito de las Sombras\\nDescripción: Lluvia ácida reflejando tonos cian y magenta sobre metal oxidado...", "negative": ""}`;

    userMessage = `Selected Voice: ${action}
Seed Idea: ${userIdea}

Generate the refined Spanish narrative concept in JSON format:`;

  } else if (mode === 'code') {
    systemPrompt = `You are a principal Unity C# developer and software architect.
Your task is to take a simple game logic request and transform it into a highly structured, professional technical requirement specification.

RULES:
1. Detail the architectural patterns to be used (e.g. Singleton, Observer, State Pattern), optimal components (ARFoundation, Cinemachine, etc.), garbage collection optimization keys, physical calculations, modular design, and robust code guidelines.
2. Detail the exact methods, variables, and structure the resulting C# script should have.
3. Output format must be raw JSON with a single key "positive" containing the refined technical requirements. Set the "negative" key to empty string.
4. Write in SPANISH. No markdown, no \`\`\`json blocks.
5. CRITICAL: Never include raw unescaped double quotes inside your string values (e.g. write 'Player' or \"Player\") to ensure valid JSON.

Example Output:
{"positive": "Desarrollar un controlador de personaje en C# usando el nuevo Input System... Métodos requeridos: Move(), Jump() con coyote time...", "negative": ""}`;

    userMessage = `Request: ${userIdea}

Generate the technical requirement specification in JSON format:`;

  } else if (mode === '3d') {
    systemPrompt = `You are a world-class 3D technical artist and game asset modeler specialized in visual game engines.
Transform the user's 3D mesh idea into a highly detailed visual prompt for a text-to-3D generator or photogrammetry model.

RULES:
1. Describe the 3D geometry, topology (low poly, clean quad topology, high-fidelity mesh), texture details (diffuse, normal, roughness, metallic maps), surface materials (e.g., rusted metal, matte plastic, polished obsidian, fabric creases), and optimal game-ready mesh characteristics.
2. Positive prompt must be in ENGLISH.
3. Negative prompt must be a tailored, high-quality negative prompt in ENGLISH. Exclude 3D generation anomalies: "distorted geometry, non-manifold geometry, loose vertices, hollow shells, overlapping faces, extra limbs, blurry textures, flat 2D projection, asymmetrical mesh, floating parts, low-res textures, duplicate meshes".
4. Output format must be raw JSON with "positive" and "negative" keys. No markdown, no \`\`\`json blocks.

Example Output format:
{"positive": "highly detailed 3D game asset of a medieval knight sword, clean quad topology, metallic blade, leather-wrapped hilt, 4k PBR textures...", "negative": "2D, illustration, flat, low quality, non-manifold geometry, loose vertices..."}`;

    userMessage = `Current Negative: ${currentNegative}
3D Mesh Idea: ${userIdea}

Generate the professional 3D prompts in JSON format:`;

  } else if (mode === 'background') {
    // La configuracion avanzada solo manda si esta activada, igual que al
    // generar: si no, refinar aplicaria restricciones que el usuario no eligio.
    const advanced = extraContext?.useProceduralWorld !== false;
    const genre = advanced ? extraContext?.gameGenre || 'rpg' : '';
    const density = advanced ? extraContext?.worldDensity || 'organic' : '';
    // Por defecto true: es el valor de fabrica del formulario, y quien no lo
    // toca espera un escenario vacio.
    const emptyScene = extraContext?.emptySceneOnly !== false;

    // Las claves del desplegable no significan nada para el modelo: hay que
    // pasarle la descripcion, no `topdown_34`.
    const perspectiveText = genre ? describePerspective(genre) : '';
    const densityText = density ? describeDensity(density) : '';
    const styleGuide = describeStyle(style);
    // Encuadre recto, mapa entero, irregularidad natural y legibilidad de
    // escenario jugable, ajustadas al tipo de composicion: un tileset SI debe
    // ir en rejilla y una capa de parallax NO es un mapa cerrado.
    // El encuadre depende de la PERSPECTIVA ademas de la composicion: "mundo
    // completo" no significa lo mismo en una cenital que en una vista lateral,
    // y en primera persona no significa nada.
    const worldRules = worldCompositionRules(density, genre);
    // Capas de parallax: contrato compartido para que las tres peguen entre si.
    const layerContract = parallaxLayerContract(extraContext?.worldName || userIdea, density);
    // La forma del lienzo cambia la composicion: un mapa panoramico no se
    // organiza como uno cuadrado. Si el prompt no lo sabe, describe una escena
    // cuadrada que luego se genera en 16:9 y queda mal repartida.
    const aspect = findAspect(extraContext?.worldAspect || '1:1');

    // Check if it is an indoor scene
    const isIndoor = ['dungeon_chamber', 'cave_passage', 'house_interior', 'castle_hall'].includes(density);
    // Check if it is a parallax layer
    const isParallax = ['parallax_background', 'parallax_midground', 'parallax_foreground'].includes(density);
    // Check if it is a tileset
    const isTileset = ['topdown_terrain', 'topdown_props', 'isometric_blocks', 'isometric_decor'].includes(density);

    let environmentDirective = '';
    let negativeExclusions = '';

    if (isIndoor) {
      environmentDirective = 'CRITICAL REQUIREMENT: This is an ENCLOSED INTERIOR scene. You MUST describe indoor structures, walls, ceilings, stone/wood textures, indoor lights (torches, lamps, candles, light shafts), and a claustrophobic/closed atmosphere. Absolutely NO outdoor elements, NO sky, NO clouds, NO sun, NO horizon, NO distant mountains, and NO external terrain. Everything must happen inside.';
      negativeExclusions = 'sky, clouds, sun, sunset, sunrise, horizon, mountains, landscape, outdoor view, exterior, trees, grass fields';
    } else if (isParallax) {
      environmentDirective = `CRITICAL REQUIREMENT: This is an isolated PARALLAX LAYER for a 2D side-scrolling level.
      - If Background: Focus only on far distant details like sky, clouds, silhouette mountains, or cityscapes.
      - If Midground: Focus on walkable platforms, hills, structures, or middle-ground scenery on a simple flat neutral backdrop.
      - If Foreground: Focus on highly detailed close-up frames, foliage, grass patches, or props at the extreme front plane.
      Keep elements clean and isolated.`;
      negativeExclusions = 'cluttered middleground (if background), distant sky (if foreground)';
    } else if (isTileset) {
      environmentDirective = 'CRITICAL REQUIREMENT: This is a modular TILESET / ASSET SHEET. Describe the tiles arranged in a grid sheet on a clean plain neutral background, showing variations of terrain blocks, walls, or decorations for level design. Keep items separated.';
      negativeExclusions = 'complete landscape, character, merged scene, blurry boundaries';
    } else {
      environmentDirective = 'Focus on environment design, rich landscape, wide angle composition, natural environmental layout, and gaming atmosphere.';
    }

    /**
     * Ambiente e iluminacion segun el tipo de escena.
     *
     * Antes esto eran tres "pipelines" que ademas imponian el ESTILO: la rama
     * por defecto forzaba "16-bit Pixel Art ... NES/SNES ... isometric oblique
     * views" pasara lo que pasara, de modo que elegir 8-bit y vista cenital 3/4
     * devolvia un prompt de 16-bit isometrico. El estilo lo decide ahora
     * `styleGuide` y solo el; aqui queda unicamente la atmosfera, que si
     * depende de si la escena es un sotano o un prado.
     */
    let atmosphereDirective = '';
    if (density === 'dungeon_chamber' || density === 'cave_passage') {
      atmosphereDirective =
        'Atmosphere: underground and enclosed, deep shadows, high-contrast chiaroscuro, torchlight and lantern pools of warm light against cold stone, damp weathered surfaces, oppressive confined mood.';
    } else if (density === 'castle_hall' || density === 'house_interior') {
      atmosphereDirective =
        'Atmosphere: interior architecture, light entering through windows or hearth, warm bounced illumination, readable floor-to-wall separation, lived-in furnishing detail.';
    } else if (isParallax) {
      atmosphereDirective =
        'Atmosphere: layered depth with clear atmospheric perspective, the further the layer the lower its contrast and saturation, consistent single light direction across the layer.';
    } else if (isTileset) {
      atmosphereDirective =
        'Atmosphere: flat even neutral studio-free illumination so every tile reads identically and can be reused anywhere in a level, no baked directional shadows between tiles.';
    } else {
      atmosphereDirective =
        'Atmosphere: cohesive outdoor environmental lighting with a single clear light direction, depth conveyed through overlapping elements and atmospheric perspective, believable ground plane.';
    }

    // El negativo es un campo compartido con el modo sprite. Los terminos de
    // sprite ("off-center", "framing", "white border", "shadow") empujarian a
    // centrar y recortar un escenario y le prohibirian las sombras que le dan
    // volumen y hora del dia, asi que se retiran al refinar un mundo.
    const baseNegative = stripSpriteOnlyNegatives(currentNegative);

    systemPrompt = `You are a world-class video game level designer and environment concept artist.
Transform the user's stage/world idea into a highly detailed visual generation prompt.

THE USER'S SELECTIONS ARE NOT SUGGESTIONS. They are hard constraints, and every
one of them must be visibly honoured in the positive prompt:

A) ART STYLE — "${style}"
   Required traits: ${styleGuide.positive}
   You MUST weave these traits into the positive prompt using this exact
   vocabulary. Do NOT substitute a different era or resolution of the same
   family (for example, never describe 16-bit when 8-bit was selected, and
   never describe pixel art when a painted style was selected).
${
  perspectiveText
    ? `
B) CAMERA PERSPECTIVE
   Required: ${perspectiveText}
   You MUST describe the scene as seen from this exact camera. Never contradict
   it with another viewpoint, and never invent a vanishing point where the
   perspective says there is none.`
    : ''
}${
      densityText
        ? `

C) COMPOSITION / SCENE LAYER
   Required: ${densityText}
   ${environmentDirective}`
        : ''
    }

D) ${atmosphereDirective}

E) CANVAS SHAPE — ${aspect.label} (${aspect.key})
   ${aspect.description}. Arrange the content to fill this shape naturally:
   spread it out along the long axis instead of leaving dead space there, and
   do not compose as if the canvas were square.

F) ${worldRules.directives}${layerContract ? `

G) ${layerContract.directive}` : ''}

RULES:
1. Describe the scene's composition, layout, lighting, materials, textures, and
   depth in professional gaming terms. Be concrete and specific: name the
   materials, the colours, the architectural features and the terrain, so the
   prompt could only produce THIS scene and not a generic one.
2. ${
      emptyScene
        ? 'The scene must be COMPLETELY EMPTY of living beings: no characters, humans, animals, NPCs or creatures. Only the environment, ready for gameplay.'
        : 'Ambient life is allowed where it suits the scene, but the environment remains the subject; do not turn it into a character portrait.'
    }
3. Before writing, list to yourself every element the user named. Your positive
   prompt must contain a clause for EACH one, in the spatial relationship they
   described, and then add supporting detail that makes the place believable.
   Nothing they asked for may be dropped, merged or substituted.
4. Write it as a PLACE, not as an inventory. It should read like somewhere that
   has been lived in and shaped over time, with reasons behind where things sit:
   the path goes where people walk, the village grew where the water is. Avoid
   the tidy, freshly-built, showroom look of a diorama.
5. Positive prompt must be in ENGLISH, dense and highly detailed, written as
   comma-separated descriptive clauses.
6. NEVER write raw configuration keys or identifiers in the output. Words like
   "topdown_34", "organic", "parallax_midground" or "full_scene" are internal
   codes and must NEVER appear in the prompt: describe what they MEAN instead.
7. Negative prompt must be in ENGLISH and must combine, in this order:
   a) The user's existing negative terms: "${baseNegative || 'none'}".
   b) Exclusions that protect the chosen style: ${styleGuide.negative}.
   c) Exclusions that protect the framing, the naturalness and the legibility of
      the map — you MUST include all of these: ${worldRules.negatives}.
   d) ${
     emptyScene
       ? 'Living-entity exclusions: characters, humans, people, NPCs, animals, creatures.'
       : 'Crowd exclusions only: crowds, character portrait, close-up face.'
   }
   ${isIndoor ? `e) CRITICAL: this is an interior, so you MUST include: "${negativeExclusions}".` : ''}
   Never contradict the chosen style in the negative prompt. If the style calls
   for a technique, that technique must NOT appear in the negatives.
8. Output format must be raw JSON with "positive" and "negative" keys. No
   markdown, no \`\`\`json blocks.
{"positive": "16-bit pixel art fantasy valley map, top-down oblique 3/4 perspective, perfectly axis-aligned at 0 degrees with no tilt, the entire island fits inside the frame with open grass margins on all four sides, a lake with a lobed irregular shoreline and shallow reed inlets, a weathered wooden bridge spanning the open water at the centre of the lake, dirt paths that curve and fork around rock outcrops and widen where they meet, carved wooden signposts leaning slightly beside the path junctions, a village of thatched cottages each set at its own angle around the northern shore, fenced corrals with uneven posts and patchy trodden ground, oak groves clustered in uneven density with lone trees standing apart, scattered bushes and undergrowth spilling at the treeline, varied grass and worn dirt textures, even readable daylight from the upper left...", "negative": "characters, people, tilted, dutch angle, cropped, trees in a straight line, evenly spaced trees, grid layout, perfectly straight roads, circular lake, perfectly symmetrical, identical repeated buildings, vignette, frame, watermark, anti-aliased, smooth gradients, 3D render..."}`;

    userMessage = `Art style: ${style}
Mode: World / Background${perspectiveText ? `\nCamera perspective: ${perspectiveText}` : ''}${
      densityText ? `\nComposition / layer: ${densityText}` : ''
    }
Scene must be empty of living beings: ${emptyScene ? 'Yes' : 'No'}
Existing negative terms: ${baseNegative || 'none'}
Environment idea: ${userIdea}

Generate the professional prompts in JSON format:`;

  } else {
    // Mode is 'sprite' (character/object)
    const isActionSpriteSheet = !!extraContext?.isActionSpriteSheet;
    const is3DStyle = (style || '').toLowerCase().includes('3d') ||
                      (style || '').toLowerCase().includes('pbr') ||
                      (style || '').toLowerCase().includes('octane') ||
                      (style || '').toLowerCase().includes('unreal') ||
                      (style || '').toLowerCase().includes('blender');

    let spriteBgDirective = '';
    if (useBasicBackgrounds) {
      if (isChromaBg) {
        spriteBgDirective = is3DStyle
          ? 'isolated 3D subject on a single uniform solid flat green background (hex #00FF00), pure flat solid neon green backdrop, clean studio illumination, neutral environment, isolated 3D asset, no split background.'
          : 'isolated subject on a single uniform solid flat green background (hex #00FF00), pure flat solid neon green backdrop, flat unlit texture, diffuse even ambient illumination, flat solid colors, 2D vector asset style, no split background.';
      } else {
        // Modo Estudio: Tanto 'white', 'transparent' o por defecto, se genera SIEMPRE en fondo blanco puro sólido para que Rembg o el recorte alfa lo extraiga a la perfección en cualquier estilo
        spriteBgDirective = is3DStyle
          ? 'clean studio illumination, neutral environment, isolated 3D character asset on a pure solid white background, flat white backdrop, diffuse even ambient illumination, no sticker border.'
          : 'isolated subject on a pure solid white background, flat white backdrop, flat unlit texture, diffuse even ambient illumination, flat solid colors, 2D vector asset style, no split background, no sticker border.';
      }
    } else {
      spriteBgDirective = '';
    }

    let actionDirective = '';
    if (isActionSpriteSheet) {
      let frameCountDesc = '6 to 8 frames animation sprite sheet sequence grid';
      const actionLower = (action || '').toLowerCase();
      if (actionLower.includes('walk') || actionLower.includes('camin')) {
        frameCountDesc = '8 to 12 frames full locomotion walk cycle animation sprite sheet sequence grid';
      } else if (actionLower.includes('run') || actionLower.includes('carrer')) {
        frameCountDesc = '6 to 8 frames high-speed run cycle animation sprite sheet sequence grid';
      } else if (actionLower.includes('idle') || actionLower.includes('respir') || actionLower.includes('repos')) {
        frameCountDesc = '4 to 6 frames subtle breathing idle loop animation sprite sheet sequence grid';
      } else if (actionLower.includes('attack') || actionLower.includes('ataq')) {
        frameCountDesc = '6 to 8 frames attack animation sprite sheet sequence grid showing windup, impact, and recovery';
      } else if (actionLower.includes('jump') || actionLower.includes('salt')) {
        frameCountDesc = '6 to 8 frames jump animation sprite sheet sequence grid showing anticipation, airborne apex, and landing';
      }
      actionDirective = `CRITICAL ANIMATED SPRITE SHEET DIRECTIVE: Generate a ${frameCountDesc} for the ${action} action, with character movement sequentially progressing across frames, maintaining perfect visual character consistency.`;
    } else if (action === 'Model Sheet' || action === 'Sprite Sheet') {
      actionDirective = 'CRITICAL MODEL SHEET DIRECTIVE: Generate a character model sheet featuring 4 distinct angle views: front view, left side profile, right side profile, and back view, cleanly arranged side-by-side.';
    } else {
      const pose = describePose(action);
      actionDirective = pose?.directive ?? `Focus on character/object design, ${action} pose, proportions.`;
    }

    const pose = describePose(action);
    const negativeDirective = pose?.negative ?? 'off-center';
    const isObject = (action || '').trim().toLowerCase() === 'static object';

    if (isCustomSceneMode) {
      systemPrompt = `You are a world-class concept artist, video game illustrator, and Stable Diffusion prompt engineer.
Your task is to transform the user's character and scene idea into a rich, immersive, fully-rendered game illustration with vivid background scenery, realistic ground contact, and natural environmental integration.

RULES:
1. Transform the user's idea into a highly detailed visual prompt where the character is naturally situated in the world and scenery described (e.g. alien planet landscape, mystical forest, cyberpunk alley, dungeon, castle, mountain vista).
2. Output your response ONLY as a valid JSON object with exactly two keys: "positive" and "negative".
3. The character MUST have firm ground contact with realistic environmental contact shadows and lighting cast from the surrounding world (e.g. standing on rocky terrain, alien soil, cobblestone, dirt path, grass).
4. Describe vivid environment elements: terrain, horizon, sky/space, atmospheric lighting, volumetric depth, and ambient colors.
5. The positive prompt MUST match the artistic style "${style}" precisely. Its defining traits are: ${describeStyle(style).positive}. You MUST weave these exact traits into the positive prompt.
6. ABSOLUTELY FORBIDDEN to output isolation or studio phrases like "isolated", "white background", "green screen", "flat backdrop", "neutral environment", "shadowless", "no ground plane", or "studio floor". The scene must be full, rich, and colorful.
7. ${isObject ? 'Focus on the object integrated into its setting.' : `Focus on the character design, dynamic ${action} stance, and surrounding environment.`} ${actionDirective}
8. PRESERVE and EXPAND all specific character and environment details the user mentions.
9. For the negative prompt, protect the chosen style: "${describeStyle(style).negative}, blurry, low quality, distorted, duplicate, cropped, out of frame, cut off, sticker, white border, capsule background, badge, watermark, text, signature". DO NOT exclude ground, terrain, floor, shadows, lighting, or scenery from the negative prompt.
10. Write the prompts in ENGLISH, as natural flowing descriptive clauses. Raw JSON only.

Example Output format:
{"positive": "masterpiece, ultra detailed illustration of a fierce alien warrior wielding an energy blade, standing firmly on rugged alien mountain terrain, dual moons in a starry cosmic sky, atmospheric blue rim lighting, cinematic depth of field...", "negative": "blurry, low quality, distorted, cropped, out of frame, sticker, white border, watermark, text..."}`;

    } else {
      systemPrompt = `You are a world-class Stable Diffusion / image generation prompt engineer specialized in video game character and sprite art.

RULES:
1. Transform the user's idea into a highly detailed, professional image generation prompt for an isolated sprite asset on a solid studio background.
2. Output your response ONLY as a valid JSON object with exactly two keys: "positive" and "negative".
3. Use specific artistic terminology: composition, lighting, color palette, texture, atmosphere, materials.
4. Include quality boosters in the positive prompt: "masterpiece", "ultra detailed", "professional illustration", "8k resolution".
5. The positive prompt MUST match the artistic style "${style}" precisely. Its defining traits are: ${describeStyle(style).positive}. You MUST weave these exact traits into the positive prompt.
6. ${isObject ? 'Focus on the object itself: its form, materials, construction and wear.' : `Focus on character design, the ${action} pose and correct proportions.`} ${spriteBgDirective} ${actionDirective}
7. CRITICAL SHADOW & STUDIO EXCLUSION RULE: For isolated sprites, the generated subject MUST be completely shadowless on a clean flat solid background. DO NOT output words like "shadow", "shadows", "shadowless", "shading", "ambient occlusion", "chroma key", "chromakey", "green screen", "studio", "studio floor", or "lighting" in the positive prompt key. ${isChromaBg ? 'Describe the green background strictly as "single uniform solid flat green background (hex #00FF00)".' : 'Describe the background strictly as "isolated subject on a pure solid white background".'} ${is3DStyle ? 'Describe the asset using 3D terms like "clean studio illumination", "neutral environment", "isolated 3D character asset", and "diffuse even ambient illumination".' : 'Describe the asset using terms like "unlit 2D asset", "flat solid color palette", "2D game sprite asset", and "diffuse even ambient illumination".'} Place all shadow and studio floor terms ONLY inside the "negative" prompt key.
8. ABSOLUTE SPRITE FRAMING RULE: The subject MUST be centered in the canvas, fully visible from head to toe without cropped limbs, isolated on the solid background. NEVER align off-center.
9. PRESERVE all specific elements the user mentions.
10. For the negative prompt, keep user's current negative terms as base and add: "${describeStyle(style).negative}, shadow, drop shadow, ground shadow, cast shadow, ambient occlusion, floor shadow, green screen studio, studio floor, green shadow, off-center, left aligned, right aligned, left side, sticker, white border, white outline, capsule background, badge, framing${negativeDirective ? `, ${negativeDirective}` : ''}".
11. Write the prompts in ENGLISH, as natural flowing descriptive clauses. Raw JSON only.

Example Output format:
{"positive": "highly detailed stylized knight character sprite sheet, front view, isolated subject on a pure solid white background...", "negative": "shadow, drop shadow, ground shadow, cast shadow, floor shadow, blurry, low quality..."}`;
    }

    userMessage = `Style: ${style}
Mode: Sprite/Character
Action: ${action}${isActionSpriteSheet ? ' (Animated Sprite Sheet Sequence)' : ''}
Current Negative terms: ${currentNegative}
User idea: ${userIdea}

Generate the professional prompts in JSON format:`;
  }

  // Determine which provider to use
  const useText = pe.useTextProvider;
  const activeTextProvider = settings?.text?.provider || (settings as any)?.provider || 'ollama';
  const provider = useText ? activeTextProvider : (pe.provider && pe.provider !== 'gemini' ? pe.provider : activeTextProvider);
  const apiKey = useText 
    ? (settings?.text?.apiKeys?.[provider] || settings?.text?.apiKey || settings?.ollama?.apiKey || (settings as any)?.geminiApiKey) 
    : (pe.apiKey || settings?.text?.apiKeys?.[provider] || (settings as any)?.geminiApiKey);
  const baseUrl = useText 
    ? (settings?.text?.baseUrl || (provider === 'ollama' ? settings?.ollama?.baseUrl : ''))
    : (pe.baseUrl || settings?.text?.baseUrl || (provider === 'ollama' ? settings?.ollama?.baseUrl : ''));
  let model = (useText ? settings?.text?.model : pe.model) || settings?.text?.model || '';

  // Si es Ollama local, resolver contra los modelos instalados ANTES del Memory Orchestrator
  if ((provider as string) === 'ollama' || (provider as string) === 'local') {
    const defaultUrl = provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1';
    const ollamaUrl = (useText ? (settings?.text?.baseUrl || settings?.ollama?.baseUrl) : baseUrl) || defaultUrl;
    try {
      const installed = await getOllamaModels(ollamaUrl);
      if (installed && installed.length > 0) {
        const availableNames = installed.map((m: any) => m.name || m.model);
        const matched = availableNames.find((n: string) => n.toLowerCase() === (model || '').toLowerCase())
                     || (model ? availableNames.find((n: string) => n.toLowerCase().includes(model.toLowerCase())) : null)
                     || availableNames.find((n: string) => !n.includes('embed') && !n.includes('vision'))
                     || availableNames[0];
        if (matched) model = matched;
      }
    } catch {
      // Ignorar error si no responde
    }
  }

  // Orquestación inteligente de memoria VRAM / RAM
  await ensureExclusiveMemoryContext(provider, model, 'promptEngineer', settings);

  try {
    let rawResponse = '';
    if ((provider as string) === 'omnideploy') {
      const id = (useText ? settings?.text?.omniDeployDeploymentId : (pe as any)?.omniDeployDeploymentId)
        || settings?.text?.omniDeployDeploymentId
        || (pe as any)?.omniDeployDeploymentId
        || settings?.image?.omniDeployDeploymentId
        || settings?.video?.omniDeployDeploymentId;
      const clave = (useText ? settings?.text?.omniDeployApiKey : (pe as any)?.omniDeployApiKey)
        || settings?.text?.omniDeployApiKey
        || (pe as any)?.omniDeployApiKey
        || settings?.image?.omniDeployApiKey
        || settings?.video?.omniDeployApiKey;
      if (!id?.trim() || !clave?.trim()) {
        throw new Error(
          'Falta el Deployment ID o la API Key de OmniDeploy para el refinador. ' +
            'Pégalos en Ajustes (en la sección de Texto, Imagen o Prompt Engineer).',
        );
      }
      const { generarTextoConOmniDeploy } = await import('./omniDeploy');
      rawResponse = await generarTextoConOmniDeploy(
        { deploymentId: id.trim(), apiKey: clave.trim() },
        userMessage,
        systemPrompt,
        undefined,
        'refinador_ia',
        signal,
        model || settings?.text?.model,
      );
    } else if (provider === 'gemini') {
      rawResponse = await geminiText(`${systemPrompt}\n\n${userMessage}`, false, apiKey, model, signal);
    } else if (provider === 'ollama' || provider === 'lm-studio' || (provider as string) === 'local') {
      const defaultUrl = provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1';
      const ollamaUrl = (useText ? (settings?.text?.baseUrl || settings?.ollama?.baseUrl) : baseUrl) || defaultUrl;
      const ollamaKey = useText ? (settings?.ollama?.apiKey || apiKey) : apiKey;

      const isLyricsMode = !!extraContext?.refineLyrics;
      const ollamaOptions = isLyricsMode
        ? { num_predict: 4096, temperature: 0.7 }
        : { format: 'json', num_predict: 2048, temperature: 0.7 };

      const isCloudMode = !!(ollamaKey && (ollamaUrl.includes('api.ollama.com') || ollamaUrl.includes('api.lmstudio.ai') || ollamaUrl.startsWith('https://')));

      if (isCloudMode) {
        rawResponse = await generateGenericCompletion(
          ollamaUrl.includes('/v1') ? ollamaUrl : `${ollamaUrl}/v1/chat/completions`,
          userMessage,
          systemPrompt,
          ollamaKey,
          false,
          signal
        );
      } else {
        rawResponse = await generateOllamaCompletion(
          ollamaUrl,
          model,
          userMessage,
          systemPrompt,
          ollamaKey,
          signal,
          ollamaOptions
        );
      }
    } else if ((provider as string) === 'llama-server') {
      const llamaUrl = (useText ? (settings?.text?.baseUrls?.['llama-server'] || settings?.text?.baseUrl) : (pe?.baseUrls?.['llama-server'] || baseUrl)) || 'http://localhost:8088/v1';
      const llamaKey = useText ? (settings?.text?.apiKeys?.['llama-server'] || apiKey) : (pe?.apiKeys?.['llama-server'] || apiKey);
      const llamaModel = (useText ? (settings?.text?.models?.['llama-server'] || settings?.text?.model) : (pe?.models?.['llama-server'] || model)) || settings?.llamaCpp?.modelPath?.split(/[\/\\]/).pop() || 'local-model';
      rawResponse = await generateLlamaServerCompletion(llamaUrl, llamaModel, userMessage, systemPrompt, llamaKey, {
        modelPath: settings?.llamaCpp?.modelPath,
        gpuLayers: settings?.llamaCpp?.gpuLayers,
        contextSize: settings?.llamaCpp?.contextSize,
        threads: settings?.llamaCpp?.threads,
        binaryPath: settings?.llamaCpp?.binaryPath,
        customArgs: settings?.llamaCpp?.customArgs
      }, signal);
    } else if (provider === 'anthropic') {
      if (!apiKey) throw new Error("Se requiere API Key para Anthropic.");
      rawResponse = await generateAnthropicCompletion(userMessage, systemPrompt, apiKey, false, model, signal);
    } else if (provider === 'openai' || provider === 'deepseek' || provider === 'qwen' || provider === 'kimi' || provider === 'openrouter' || provider === 'cometapi') {
      if (!apiKey) throw new Error(`Se requiere API Key para ${String(provider).toUpperCase()}.`);
      rawResponse = await generateOpenAICompletion(userMessage, systemPrompt, apiKey, provider as any, false, model, signal);
    } else if (provider === 'other') {
      if (!baseUrl) throw new Error("Se requiere URL del servidor para provider 'other'.");
      rawResponse = await generateGenericCompletion(baseUrl, userMessage, systemPrompt, apiKey, false, signal, model);
    } else {
      throw new Error(`Provider "${provider}" no soportado para Prompt Engineer.`);
    }

    // Parse the JSON response
    try {
      // Remove markdown code blocks if the LLM ignored instructions
      const cleanedResponse = rawResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = robustJSONParse(cleanedResponse);
      if (parsed && parsed.positive && parsed.positive.trim()) {
        let pos = parsed.positive.trim();
        let neg = parsed.negative ? parsed.negative.trim() : "";

        if (neg) {
          const forbiddenInNegative = [
            'studio illumination', 'neutral environment', 'isolated', 'isolated 3d character asset',
            'isolated subject', 'shadowless', 'flat backdrop', 'no ground plane', 'no-ground-plane',
            'no- ground-shadows', 'sword glow', 'trying to depict background elements', 'portraying a scene',
            'unless it\'s a character asset', 'unless it is a character asset'
          ];
          if (isChromaBg) {
            forbiddenInNegative.push('green background', 'neon green background', 'solid flat green background', 'solid green background');
          } else {
            forbiddenInNegative.push('white background', 'pure solid white background', 'solid white background', 'flat white backdrop', 'plain background');
          }
          
          let terms = neg.split(',').map((t: string) => t.trim()).filter(Boolean);
          terms = terms.filter((term: string) => {
            const low = term.toLowerCase();
            return !forbiddenInNegative.some(f => low === f || low.includes(f));
          });
          
          // Deduplicar términos manteniendo el orden
          const seen = new Set<string>();
          const cleanTerms: string[] = [];
          for (const t of terms) {
            const low = t.toLowerCase();
            if (!seen.has(low)) {
              seen.add(low);
              cleanTerms.push(t);
            }
          }
          neg = cleanTerms.join(', ');
        }

        return {
          positive: pos,
          negative: neg
        };
      }
      throw new Error("El JSON devuelto no contiene el campo 'positive'.");
    } catch (parseError: any) {
      console.warn("[Omni IA Game] Aviso parseando respuesta del Prompt Engineer:", parseError, rawResponse);
      const refineLyrics = !!extraContext?.refineLyrics;
      if (refineLyrics && rawResponse && rawResponse.trim()) {
        console.log("[Omni IA Game] Extrayendo letra multilínea generada directamente de la respuesta.");
        let cleanLyrics = rawResponse
          .replace(/```json\s*/gi, '')
          .replace(/```markdown\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim();

        // Si venía dentro de una clave JSON "positive", extraer el texto interno limpio
        const posMatch = cleanLyrics.match(/"positive"\s*:\s*"([\s\S]*)/i);
        if (posMatch && posMatch[1]) {
          cleanLyrics = posMatch[1]
            .replace(/",\s*"negative"[\s\S]*/gi, '')
            .replace(/"\s*}\s*$/gi, '')
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .trim();
        }

        // Cortar patrones alucinados repetitivos al final (e.g. n.l.m.l.m... o a.b.a.b...)
        cleanLyrics = cleanLyrics
          .replace(/(?:\s*[a-z]\.[a-z]\.){3,}[\s\S]*/gi, '')
          .replace(/(?:\s*[a-z]\s*[a-z]\s*){10,}[\s\S]*/gi, '')
          .trim();

        return { positive: cleanLyrics, negative: "" };
      }

      if (userIdea && userIdea.trim()) {
        const styleInfo = typeof describeStyle === 'function' ? describeStyle(style) : { positive: '', negative: '' };
        const fallbackPos = `${userIdea.trim()}${styleInfo.positive ? `, ${styleInfo.positive}` : ''}`;
        const fallbackNeg = currentNegative || styleInfo.negative || '';
        console.log("[Omni IA Game] Usando prompt estructurado de respaldo para no interrumpir el flujo.");
        return {
          positive: fallbackPos,
          negative: fallbackNeg
        };
      }
      throw new Error("La IA no devolvió un formato JSON válido.");
    }
  } catch (e: any) {
    throw new Error(`Prompt Engineer error: ${e.message || e}`);
  } finally {
    await releasePostGenerationMemory(provider, settings, model);
  }
};

const proxyModelUrlIfNeeded = async (url: string, invokeFn: any): Promise<string> => {
  if (url && (url.startsWith('http://') || url.startsWith('https://')) && !url.startsWith('data:')) {
    console.log(`[Omni IA Game] Proxying external/local 3D model URL to bypass CORS: ${url}`);
    try {
      const proxied = await invokeFn('proxy_request', {
        url: url,
        method: 'GET'
      });
      if (proxied && proxied.startsWith('data:')) {
        return proxied;
      }
    } catch (e) {
      console.error("[Omni IA Game] Failed to proxy 3D model URL:", e);
    }
  }
  return url;
};

export const generate3DModel = async (
  prompt: string,
  settings?: ProjectData['apiSettings'],
  initImageBase64?: string,
  negativePrompt?: string,
  options?: { useRandomSeed?: boolean; customSeed?: number }
): Promise<{ modelUrl: string; modelType: 'glb' | 'gltf' | 'obj' }> => {
  const seedToPass = options?.useRandomSeed === false && options?.customSeed !== undefined ? options.customSeed : undefined;
  const provider = settings?.threeD?.provider || 'comfyui';
  const threeDModel = settings?.threeD?.model || '3d_workflow';

  // Orquestación inteligente de memoria VRAM / RAM
  await ensureExclusiveMemoryContext(provider, threeDModel, '3d', settings);

  try {
    // OmniDeploy va por `generateLocal3DModel`, EL MISMO CAMINO QUE COMFYUI: el
    // grafo del usuario recibe alli sus inyecciones -prompt, negativo, imagen de
    // partida, semillas- y solo cambia el destino al final. Las credenciales
    // viajan en los huecos existentes: `endpoint` lleva el Deployment ID y
    // `apiKey` la clave.
    if ((provider as string) === 'omnideploy') {
    const resPayload = await generateLocal3DModel(
      settings?.threeD?.omniDeployDeploymentId || '',
      prompt,
      settings?.threeD?.omniDeployApiKey,
      'omnideploy',
      initImageBase64,
      negativePrompt,
      settings?.threeD?.customWorkflow,
      settings?.threeD?.promptNode,
      settings?.threeD?.negativeNode,
      settings?.threeD?.imageNode,
      seedToPass
    );
    const parsed = JSON.parse(resPayload);
    return { modelUrl: parsed.modelUrl, modelType: parsed.modelType || 'glb' };
  }
  const apiKey = settings?.threeD?.apiKeys?.[provider] || settings?.threeD?.apiKey;
  const baseUrl = settings?.threeD?.baseUrl || '';
  const model = settings?.threeD?.model || 'tripo-v2.0';

  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

  if (provider === 'comfyui' || provider === 'a1111') {
    const resPayload = await generateLocal3DModel(
      baseUrl,
      prompt,
      apiKey,
      provider,
      initImageBase64,
      negativePrompt,
      '3d',
      settings?.threeD?.promptNode,
      settings?.threeD?.negativeNode,
      settings?.threeD?.imageNode,
      seedToPass
    );
    try {
      const parsed = JSON.parse(resPayload);
      const proxiedUrl = await proxyModelUrlIfNeeded(parsed.modelUrl, invokeFn);
      return {
        modelUrl: proxiedUrl,
        modelType: parsed.modelType || 'glb'
      };
    } catch {
      const proxiedUrl = await proxyModelUrlIfNeeded(resPayload, invokeFn);
      return {
        modelUrl: proxiedUrl,
        modelType: 'glb'
      };
    }
  }

  if (provider === 'comfydeploy') {
    if (!apiKey) throw new Error("Se requiere una API Key de ComfyDeploy para la generación 3D.");
    if (!baseUrl) throw new Error("Se requiere un Deployment ID de ComfyDeploy para la generación 3D.");

    const queueUrl = 'https://api.comfydeploy.com/api/run/deployment/queue';
    const cdHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    const payload = {
      deployment_id: baseUrl,
      inputs: {
        prompt: prompt,
        positive: prompt,
        text: prompt,
        init_image: initImageBase64 || "",
        input_image: initImageBase64 || "",
        image: initImageBase64 || ""
      }
    };

    console.log(`[Omni IA Game] Encolando 3D en ComfyDeploy para el deployment: ${baseUrl}`);
    if (!invokeFn) throw new Error("Entorno Tauri no disponible.");

    const resStr = await invokeFn('proxy_request', {
      url: queueUrl,
      method: 'POST',
      payload: payload,
      headers: cdHeaders
    });
    const data = JSON.parse(resStr);
    const runId = data.run_id;
    if (!runId) throw new Error("ComfyDeploy no devolvió ningún run_id válido.");

    // Polling ComfyDeploy
    let modelUrl = "";
    let attempts = 0;
    while (!modelUrl && attempts < 150) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
      const runResStr = await invokeFn('proxy_request', {
        url: `https://api.comfydeploy.com/api/run/${runId}`,
        method: 'GET',
        headers: cdHeaders
      });
      const runData = JSON.parse(runResStr);
      if (runData.status === 'SUCCESS' && runData.outputs && runData.outputs.length > 0) {
        for (const out of runData.outputs) {
          if (out.gltf_url) {
            modelUrl = out.gltf_url;
            break;
          }
          if (out.model_url) {
            modelUrl = out.model_url;
            break;
          }
        }
      } else if (runData.status === 'FAILED') {
        throw new Error("La generación 3D en ComfyDeploy falló.");
      }
    }
    if (!modelUrl) throw new Error("Se agotó el tiempo esperando la respuesta 3D de ComfyDeploy.");
    const proxiedUrl = await proxyModelUrlIfNeeded(modelUrl, invokeFn);
    return { modelUrl: proxiedUrl, modelType: 'glb' };
  }

  // Tripo 3D Cloud
  if (provider === 'tripo') {
    if (!apiKey) throw new Error("Se requiere una API Key de Tripo 3D para la generación.");
    if (!invokeFn) throw new Error("Entorno Tauri no disponible.");

    console.log("[Omni IA Game] Calling Tripo 3D API...");
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    const taskPayload: any = {
      type: "image_to_3d",
      file: {
        type: "png",
        url: initImageBase64 && initImageBase64.startsWith('http') 
          ? initImageBase64 
          : "https://platform.tripo3d.ai/placeholder.png"
      },
      model_version: model.replace('tripo-', '')
    };

    if (initImageBase64 && !initImageBase64.startsWith('http')) {
      console.warn("[Omni IA Game] Tripo 3D API requires a public image URL. Meshy is recommended for base64.");
    }

    const taskResultStr = await invokeFn('proxy_request', {
      url: 'https://api.tripo3d.ai/v2/openapi/task',
      method: 'POST',
      payload: taskPayload,
      headers: headers
    });

    const taskData = JSON.parse(taskResultStr);
    if (!taskData.data || !taskData.data.task_id) {
      throw new Error(`Tripo 3D task creation failed: ${taskData.message || 'Unknown error'}`);
    }
    const taskId = taskData.data.task_id;
    console.log(`[Omni IA Game] Tripo 3D task created: ${taskId}. Polling...`);

    let glbUrl = "";
    let attempts = 0;
    while (!glbUrl && attempts < 150) {
      await new Promise(r => setTimeout(r, 3000));
      attempts++;
      const statusResStr = await invokeFn('proxy_request', {
        url: `https://api.tripo3d.ai/v2/openapi/task/${taskId}`,
        method: 'GET',
        headers: headers
      });
      const statusData = JSON.parse(statusResStr);
      const status = statusData.data?.status;
      if (status === 'success') {
        glbUrl = statusData.data?.output?.model || "";
        break;
      } else if (status === 'failed') {
        throw new Error(`La generación de Tripo 3D falló: ${statusData.data?.error || 'error desconocido'}`);
      }
    }

    if (!glbUrl) throw new Error("Se agotó el tiempo esperando la respuesta 3D de Tripo 3D.");
    const proxiedUrl = await proxyModelUrlIfNeeded(glbUrl, invokeFn);
    return { modelUrl: proxiedUrl, modelType: 'glb' };
  }

  // Meshy Cloud
  if (provider === 'meshy') {
    if (!apiKey) throw new Error("Se requiere una API Key de Meshy para la generación.");
    if (!invokeFn) throw new Error("Entorno Tauri no disponible.");

    console.log("[Omni IA Game] Calling Meshy API...");
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    const taskPayload = {
      image_url: initImageBase64 || "https://platform.tripo3d.ai/placeholder.png",
      should_texture: true,
      should_remesh: true,
      model_version: model || "meshy-6"
    };

    const taskResultStr = await invokeFn('proxy_request', {
      url: 'https://api.meshy.ai/v1/image-to-3d',
      method: 'POST',
      payload: taskPayload,
      headers: headers
    });

    const taskData = JSON.parse(taskResultStr);
    if (!taskData.result) {
      throw new Error(`Meshy task creation failed: ${taskData.message || 'Unknown error'}`);
    }
    const taskId = taskData.result;
    console.log(`[Omni IA Game] Meshy task created: ${taskId}. Polling...`);

    let glbUrl = "";
    let attempts = 0;
    while (!glbUrl && attempts < 150) {
      await new Promise(r => setTimeout(r, 3000));
      attempts++;
      const statusResStr = await invokeFn('proxy_request', {
        url: `https://api.meshy.ai/v1/image-to-3d/${taskId}`,
        method: 'GET',
        headers: headers
      });
      const statusData = JSON.parse(statusResStr);
      const status = statusData.status;
      if (status === 'SUCCEEDED') {
        glbUrl = statusData.model_urls?.glb || "";
        break;
      } else if (status === 'FAILED') {
        throw new Error(`La generación de Meshy falló: ${statusData.task_error?.message || 'error desconocido'}`);
      }
    }

    if (!glbUrl) throw new Error("Se agotó el tiempo esperando la respuesta 3D de Meshy.");
    const proxiedUrl = await proxyModelUrlIfNeeded(glbUrl, invokeFn);
    return { modelUrl: proxiedUrl, modelType: 'glb' };
  }

  throw new Error(`Proveedor de 3D no soportado: ${provider}`);
  } finally {
    await releasePostGenerationMemory(provider, settings, threeDModel);
  }
};