
import { GoogleGenAI, Modality } from "@google/genai";
import { ActionType, ArtStyle } from "../types";

const getApiKey = (override?: string) => {
  return override || process.env.GEMINI_API_KEY || process.env.API_KEY || '';
};

const getAi = (override?: string) => {
  const key = getApiKey(override);
  return new GoogleGenAI({ apiKey: key });
};

// Helper genérico para reintentar llamadas a la API de Gemini ante errores temporales (503/429) con backoff exponencial
const retryCall = async <T>(fn: () => Promise<T>, retries: number = 3, delayMs: number = 1000): Promise<T> => {
  let lastError: any;
  let currentDelay = delayMs;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      const errorMsg = e.message || String(e);
      const isTransient = errorMsg.includes('503') || 
                          errorMsg.includes('UNAVAILABLE') || 
                          errorMsg.includes('429') || 
                          errorMsg.includes('RESOURCE_EXHAUSTED') || 
                          errorMsg.includes('overloaded');
      
      if (isTransient && i < retries - 1) {
        console.warn(`[Gemini Retry] Intento ${i + 1} falló debido a alta demanda/límite de cuota (${errorMsg}). Reintentando en ${currentDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        currentDelay *= 1.5; // Backoff exponencial
      } else {
        throw e;
      }
    }
  }
  throw lastError;
};

// System instructions for the "Director" persona
const CODE_SYSTEM_INSTRUCTION = `
Actúa como el Lead Developer de un estudio de videojuegos global.
Tus directrices:
1. Escribe scripts en C# para Unity, C++ para Unreal Engine, o GDScript para Godot según se solicite.
2. Prioriza el código limpio, modular y bien documentado.
3. Enfócate en patrones de diseño de videojuegos (State Machines, Command Pattern, Observer, etc.).
4. Si el usuario no especifica motor, asume Unity C#.
`;

const AUDIO_SYSTEM_INSTRUCTION = `
Actúa como el Director de Sonido para una producción de videojuegos de alto nivel.
1. Describe atmósferas sonoras, efectos de sonido (SFX) y composiciones musicales.
2. Categorías: Sonido Ambiente, Canciones Vocales, Banda Sonora (OST).
3. Especifica instrumentos, tempo, tonalidad y texturas sonoras.
4. Describe el procesamiento de audio (reverb, delay, ecualización) para lograr la inmersión.
`;

const NARRATIVE_SYSTEM_INSTRUCTION = `
Eres un Lead Narrative Designer y Director Creativo galardonado de clase mundial para videojuegos AAA (al nivel de Neil Druckmann, Hideo Kojima, Sam Lake, Ken Levine y Hidetaka Miyazaki).
Tu tarea es generar guiones, lore profundo, perfiles de personajes con matices psicológicos y diálogos cinematográficos memorables.

DIRECTIVA CREATIVA Y PROHIBICIÓN ABSOLUTA DE CLICHÉS:
- PROHIBIDO USAR TÍTULOS O NARRATIVAS GENÉRICAS / CLICHÉS DE IA como: "Ecos de...", "Sombras de...", "El Despertar de...", "Las Cenizas de...", "Crónicas de...", "El Destino de...".
- INVENTA TÍTULOS ÚNICO, IMPACTANTES Y MEMORABLES directamente alineados con la temática de la idea (ej: "NEON VELOCITY: OVERDRIVE", "VECTOR CERO", "SIGNAL LOST", "PROTOCOLO SILENCIO", "DISRUPT", "STATIC SOULS").
- Desarrolla historias con alta tensión dramática, conflicto moral real y conceptos mecánicos verdaderamente innovadores.

REGLAS DE FORMATO OBLIGATORIAS:
- NUNCA uses formato Markdown. PROHIBIDO usar asteriscos (*), dobles asteriscos (**), almohadillas (#), guiones bajos (_), comillas invertidas, ni ningún carácter de formato.
- NO incluyas encabezados como "Spanish Version" o "English Version".
- NO incluyas instrucciones, metadatos ni notas para el lector.
- Escribe SOLO texto limpio y plano, listo para lectura en voz alta.
- Usa números (1. 2. 3.) para secciones.
`;

const TRANSLATION_SYSTEM_INSTRUCTION = `
Eres un experto traductor de localización para videojuegos.
Traduce el texto proporcionado (normalmente en español regional colombiano) a un inglés técnico fluido y profesional, adecuado para subtítulos o guiones de voz en un juego de terror internacional.
Mantén la intención dramática. Retorna SOLO el texto traducido.
`;

export const generateSpriteAsset = async (
  character: string,
  action: ActionType,
  style: ArtStyle,
  details: string,
  negativePrompt: string,
  referenceImageBase64?: string,
  mode: 'sprite' | 'background' = 'sprite',
  overrideApiKey?: string
): Promise<string> => {
  const currentKey = getApiKey(overrideApiKey);
  if (!currentKey) throw new Error("API Key missing");
  const currentAi = getAi(overrideApiKey);

  const cleanBase64 = referenceImageBase64 ? referenceImageBase64.split(',')[1] : null;

  // Kinetic descriptions for the prompt
  let kineticSpec = "";
  if (action === 'Walk') kineticSpec = "Legs mid-stride, sense of forward momentum.";
  else if (action === 'Attack') kineticSpec = "Aggressive strike pose, fully extended.";
  else if (action === 'Jump') kineticSpec = "Mid-air pose, legs bent for takeoff.";
  else if (action === 'Model Sheet') kineticSpec = "Technical orthographic sheet: Front, Side, Back views.";

  let promptText = `
    TASK: Create a Game Asset (${mode === 'sprite' ? 'Character/Object' : 'Environment'}).
    SUBJECT: ${character}
    STYLE: ${style}
    ACTION/POSE: ${action} (${kineticSpec})
    DETAILS: ${details}

    [TECHNICAL SPECIFICATIONS]
    - Background: SOLID PURE BLACK (#000000) MANDATORY for sprites. No shadows on floor. No gradients.
    - Quality: High definition, professional game art.
    - Composition: Centered, clear silhouette.

    [ANIMATION PRINCIPLES TO CONSIDER]
    - If applicable, apply: Squash and Stretch, Anticipation, Staging, Arcs, Timing.

    Negative Prompt: ${negativePrompt}, text, ui, watermark, blurry, low quality, distorted limbs.
  `;

  try {
    const parts: any[] = [{ text: promptText }];
    if (cleanBase64) {
      parts.unshift({ inlineData: { data: cleanBase64, mimeType: 'image/png' } });
    }

    const response = await currentAi.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: parts },
      config: {
        imageConfig: {
          aspectRatio: mode === 'background' ? "16:9" : "1:1"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Asset generation error:", error);
    throw error;
  }
};

export const generateUnityCode = async (userPrompt: string, overrideApiKey?: string): Promise<string> => {
    const currentKey = getApiKey(overrideApiKey);
    if (!currentKey) throw new Error("API Key missing");
    const currentAi = getAi(overrideApiKey);
    try {
        const response = await currentAi.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: userPrompt,
            config: { 
                systemInstruction: CODE_SYSTEM_INSTRUCTION,
                maxOutputTokens: 8192
            }
        });
        return response.text || "// No code generated.";
    } catch (error) {
        console.error("Code generation error:", error);
        return "// Error generating code.";
    }
};

const generateAudioAtmosphereFallbackTTS = async (userPrompt: string, overrideApiKey?: string, isSfx: boolean = false): Promise<string> => {
    let fallbackPrompt = `Actúa como diseñador de sonido. Describe de forma inmersiva y en detalle el efecto de sonido (SFX) o atmósfera musical solicitado: ${userPrompt}. Detalla los instrumentos, tempo, reverb y sensación espacial. Escribe SOLO el texto descriptivo plano, máximo 3 frases, sin markdown.`;
    if (!isSfx) {
      fallbackPrompt = `Actúa como compositor musical. Describe en detalle la pieza musical o melodía solicitada: ${userPrompt}. Especifica el ritmo, instrumentos y progresión armónica. Escribe SOLO el texto descriptivo plano, máximo 3 frases, sin markdown.`;
    }
    try {
        const textDescription = await generateNarrativeText(fallbackPrompt, false, overrideApiKey);
        const audioResult = await generateNarrativeAudio(
            textDescription,
            isSfx ? 'Kore' : 'Charon',
            isSfx ? 'ambient' : 'ost',
            overrideApiKey
        );
        return `data:${audioResult.mimeType};base64,${audioResult.data}`;
    } catch (e: any) {
        console.error("Audio atmosphere fallback TTS failed:", e);
        throw new Error(`Fallo en la generación de audio con Gemini. Error original de Lyria: 500/Restringido. Error de fallback TTS: ${e.message || e}`);
    }
};

export const generateAudioAtmosphere = async (userPrompt: string, overrideApiKey?: string, isSfx: boolean = false): Promise<string> => {
    const currentKey = getApiKey(overrideApiKey);
    if (!currentKey) throw new Error("API Key missing");
    const currentAi = getAi(overrideApiKey);

    // Seleccionar el modelo de música/SFX de Lyria 3
    const targetModel = isSfx ? 'lyria-3-clip-preview' : 'lyria-3-pro-preview';
    const fallbackModel = 'lyria-3-clip-preview';

    const tryGenerate = async (modelName: string): Promise<string> => {
        console.log(`[Gemini Lyria] Intentando generar música/SFX con el modelo: ${modelName}`);
        const response = await currentAi.models.generateContent({
            model: modelName,
            contents: userPrompt,
            config: {
                responseModalities: ["audio"]
            }
        });

        const candidates = response.candidates || [];
        if (candidates.length === 0) {
            throw new Error(`El modelo ${modelName} no retornó candidatos.`);
        }

        const candidate = candidates[0];
        const parts = candidate.content?.parts || [];
        
        let audioData: string | undefined = undefined;
        let mimeType = 'audio/mp3'; // Lyria usualmente retorna MP3 o WAV

        for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
                audioData = part.inlineData.data;
                if (part.inlineData.mimeType) {
                    mimeType = part.inlineData.mimeType;
                }
                break;
            }
        }

        if (!audioData) {
            throw new Error(`No se encontraron datos binarios de audio en la respuesta del modelo ${modelName}.`);
        }

        return `data:${mimeType};base64,${audioData}`;
    };

    try {
        return await tryGenerate(targetModel);
    } catch (firstError: any) {
        console.warn(`[Gemini Lyria] Fallo con ${targetModel}: ${firstError.message || firstError}. Reintentando con el modelo fallback ${fallbackModel}...`);
        try {
            if (targetModel !== fallbackModel) {
                return await tryGenerate(fallbackModel);
            } else {
                throw firstError;
            }
        } catch (fallbackError: any) {
            console.warn(`[Gemini Lyria] El modelo de respaldo también falló: ${fallbackError.message || fallbackError}. Aplicando fallback de narración de atmósfera con TTS...`);
            return await generateAudioAtmosphereFallbackTTS(userPrompt, overrideApiKey, isSfx);
        }
    }
};

export const translateToTechnicalEnglish = async (text: string, overrideApiKey?: string): Promise<string> => {
  const currentKey = getApiKey(overrideApiKey);
  if (!currentKey) throw new Error("API Key missing");
  const currentAi = getAi(overrideApiKey);
  const response = await currentAi.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: `Traduce esto a inglés técnico de videojuegos: ${text}`,
    config: {
      systemInstruction: TRANSLATION_SYSTEM_INSTRUCTION,
      maxOutputTokens: 8192
    }
  });
  return response.text || "Technical translation error.";
};

export const generateNarrativeText = async (idea: string, isExpansion: boolean = false, overrideApiKey?: string, modelOverride?: string, signal?: AbortSignal): Promise<string> => {
  if (signal?.aborted) {
    throw new DOMException('Aborted by user', 'AbortError');
  }
  const currentKey = getApiKey(overrideApiKey);
  if (!currentKey) throw new Error("API Key missing");
  const currentAi = getAi(overrideApiKey);

  let promptContent = `Genera un guión narrativo basado en esta idea: ${idea}

Escribe SOLO texto plano y limpio, sin asteriscos, sin formato markdown, sin encabezados decorativos. El texto debe poder ser leído en voz alta directamente.`;

  if (isExpansion) {
    promptContent = `Eres un Lead Narrative Designer y Director Creativo de videojuegos de talla mundial (al nivel de Neil Druckmann, Hideo Kojima, Sam Lake, Ken Levine y Miyazaki). Transformas cualquier semilla o idea en una obra de arte narrativa y en un Documento de Diseño de Juego (GDD) profesional e inmersivo.

Idea base del usuario: "${idea}"

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

REGLAS DE FORMATO ABSOLUTAS E INNEGOCIABLES:
- PROHIBIDO usar asteriscos (*), dobles asteriscos (**), almohadillas (#), guiones bajos (_) o cualquier caracter de formato markdown.
- PROHIBIDO escribir prefijos de idioma (ES:, EN:), o etiquetas dobles en los diálogos. La sección en español debe estar 100% únicamente en español latinoamericano.
- PROHIBIDO incluir instrucciones, notas al lector o metadatos.
- Escribe SOLO texto plano y limpio listo para lectura en voz alta.
- Usa solamente números (1. 2. 3.) y saltos de línea para organizar secciones.

FORMATO DE SALIDA OBLIGATORIO:
Escribe TODO el GDD completo, extenso, narrativamente fascinante e inmersivo 100% en espanol latinoamericano.
`;
  }

  let modelName = modelOverride && modelOverride.trim() !== '' ? modelOverride : 'gemini-3.5-flash';

  // Salvaguarda contra modelos obsoletos o inexistentes guardados en la BD del usuario
  if (modelName.includes('gemini-3-pro-preview') || modelName.includes('gemini-3-flash-preview')) {
    modelName = 'gemini-3.5-flash';
  }

  const tryCallModel = async (mName: string) => {
    const response = await currentAi.models.generateContent({
      model: mName,
      contents: promptContent,
      config: {
        systemInstruction: NARRATIVE_SYSTEM_INSTRUCTION,
        maxOutputTokens: 8192
      }
    });
    return response.text;
  };

  try {
    const callPromise = retryCall(() => tryCallModel(modelName));
    if (!signal) {
      const resText = await callPromise;
      return resText || "No se pudo generar el texto.";
    }
    const abortPromise = new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted by user', 'AbortError')), { once: true });
    });
    const resText = await Promise.race([callPromise, abortPromise]);
    return resText || "No se pudo generar el texto.";
  } catch (err: any) {
    if (err?.name === 'AbortError' || String(err).includes('Aborted')) {
      throw new DOMException('Aborted by user', 'AbortError');
    }
    const secondaryModel = modelName === 'gemini-3.1-flash-lite' ? 'gemini-3.5-flash' : 'gemini-3.1-flash-lite';
    console.warn(`[Gemini Text] Fallo persistente con ${modelName} (${err.message || err}). Reintentando con modelo secundario ${secondaryModel}...`);
    try {
      const resText = await retryCall(() => tryCallModel(secondaryModel));
      return resText || "No se pudo generar el texto.";
    } catch (err2: any) {
      console.error(`[Gemini Text] Ambos modelos de texto fallaron.`, err2);
      throw err;
    }
  }
};

export const generateNarrativeAudio = async (text: string, voiceType: string, category: 'ambient' | 'vocal' | 'ost', overrideApiKey?: string): Promise<{ data: string, mimeType: string }> => {
  const currentKey = getApiKey(overrideApiKey);
  if (!currentKey) throw new Error("API Key missing");
  const currentAi = getAi(overrideApiKey);
  
  let voiceName = 'Fenrir';
  let textToSpeak = '';

  if (category === 'ambient') {
    // TTS cannot generate real SFX, so we generate a "Design Note"
    textToSpeak = `Audio Design Log. Subject: Ambient Soundscape. ${text}. Suggested layers: wind, distant rumble, and texture noise.`;
    voiceName = 'Kore'; // Ethereal voice for concepts
  } else if (category === 'ost') {
    textToSpeak = `Music Composition Brief. Title: ${text}. Instrumentation: Strings, Percussion, Synthesizers. Mood: Atmospheric and Tense.`;
    voiceName = 'Charon'; // Deep voice for music briefs
  } else {
    // Vocal
    switch (voiceType) {
      case 'Hero': 
      case 'Zephyr': voiceName = 'Zephyr'; break;
      case 'Villain': 
      case 'Charon': voiceName = 'Charon'; break;
      case 'Narrator': 
      case 'Puck': voiceName = 'Puck'; break;
      case 'Ethereal': 
      case 'Kore': voiceName = 'Kore'; break;
      case 'Aoede': voiceName = 'Aoede'; break;
      case 'Fenrir': voiceName = 'Fenrir'; break;
      default: voiceName = 'Fenrir';
    }
    textToSpeak = text;
  }

  try {
    const response = await retryCall(() => currentAi.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: textToSpeak }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      }
    }));

    console.log("[Gemini TTS Debug] Response structure:", {
      hasCandidates: !!response.candidates,
      candidatesLength: response.candidates?.length,
      firstPart: response.candidates?.[0]?.content?.parts?.[0],
      hasInlineData: !!response.candidates?.[0]?.content?.parts?.[0]?.inlineData,
      hasText: !!response.candidates?.[0]?.content?.parts?.[0]?.text
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];

    // Si devolvió texto en lugar de audio, es un error de configuración
    if (part?.text && !part?.inlineData) {
      throw new Error(`Gemini devolvió texto en lugar de audio. Verifica que tu API Key tenga acceso a TTS. Respuesta: ${part.text.substring(0, 200)}`);
    }

    if (!part || !part.inlineData || !part.inlineData.data) {
        throw new Error("No audio generated");
    }

    const mimeType = part.inlineData.mimeType || 'audio/mp3';
    return { data: part.inlineData.data, mimeType };
  } catch (e: any) {
    console.error("[Gemini TTS] Falló la síntesis de voz:", e);
    throw e;
  }
};

export const generateAnimationVideo = async (
  prompt: string,
  imageBase64: string,
  aspectRatio: '16:9' | '9:16' = '16:9',
  overrideApiKey?: string
): Promise<string> => {
  const currentKey = getApiKey(overrideApiKey);
  if (!currentKey) throw new Error("API Key missing");
  const currentAi = getAi(overrideApiKey);

  const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

  let operation = await currentAi.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: prompt,
    image: {
      imageBytes: cleanBase64,
      mimeType: 'image/png',
    },
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: aspectRatio
    }
  });

  // Poll for completion
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await currentAi.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed");

  const response = await fetch(downloadLink, {
    method: 'GET',
    headers: {
      'x-goog-api-key': currentKey,
    },
  });

  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

export const generateSpriteSheet = async (
  character: string,
  animationType: string,
  style: ArtStyle,
  details: string,
  referenceImageBase64?: string,
  overrideApiKey?: string
): Promise<string> => {
  const currentKey = getApiKey(overrideApiKey);
  if (!currentKey) throw new Error("API Key missing");
  const currentAi = getAi(overrideApiKey);

  const cleanBase64 = referenceImageBase64 ? referenceImageBase64.split(',')[1] : null;

  let promptText = `
    TASK: Create a professional 2D Animation Sprite Sheet for a video game.
    SUBJECT: ${character}
    ANIMATION: ${animationType}
    STYLE: ${style}
    DETAILS: ${details}
    
    [TECHNICAL SPECIFICATIONS]
    - Layout: A STRICT 4x4 GRID of 16 distinct animation frames.
    - Background: SOLID PURE BLACK (#000000).
    - Alignment: The character MUST be PERFECTLY CENTERED within each of the 16 grid cells.
    - Stationary Animation: The character must walk IN PLACE (treadmill style). Do NOT move the character's root position across the grid.
    - Consistency: The character must be IDENTICAL in size, proportions, and design across all frames.
    
    [VISUAL REFERENCE]
    - Use the provided reference image as the ABSOLUTE source for character design. 
    - Maintain the exact colors, clothing, and features from the reference.
    
    [ANIMATION GUIDANCE: ${animationType}]
    - The 16 frames must represent a COMPLETE, STATIONARY, and FLUID cycle of the ${animationType}.
    ${animationType === 'Walk Cycle' ? `
    - For a Walk Cycle, include all key positions: Contact, Down, Passing, Up.
    - The character stays in the center of the cell; only the limbs and body move to simulate walking.
    - Ensure a full stride: Left foot forward -> Passing -> Right foot forward -> Passing -> Back to start.
    ` : `
    - Show the full progression from start to finish of the ${animationType} action, keeping the character centered.
    `}
    - Frames 1-16 must show a continuous, non-stuttering loop.
    - Each frame must be a distinct step in the movement, showing clear progression of limbs and body weight.
    - Avoid "sliding" feet; ensure feet plant and move realistically.
    
    Negative Prompt: text, watermark, blurry, distorted, messy grid, overlapping frames, static pose, idle movement, inconsistent character design.
  `;

  try {
    const parts: any[] = [{ text: promptText }];
    if (cleanBase64) {
      parts.unshift({ inlineData: { data: cleanBase64, mimeType: 'image/png' } });
    }

    const response = await currentAi.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: parts },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    throw new Error("No sprite sheet generated");
  } catch (error) {
    console.error("Sprite sheet generation error:", error);
    throw error;
  }
};
