/**
 * ---------------------------------------------------------------------------
 *  Cerebro de Inferencia del Agente Fénix (services/fenixBrain.ts)
 * ---------------------------------------------------------------------------
 *  Orquesta la inferencia híbrida (Local HyperQwen en Ollama o llama-server,
 *  Gemini, Anthropic y OpenAI), la detección de emociones para el avatar,
 *  el modo multi-agente simultáneo (Co-Piloto Dúo) y el llamado a herramientas MCP.
 * ---------------------------------------------------------------------------
 */

import { FenixAgentConfig, FenixChatMessage, FenixEmotion } from '../types';
import { ART_STYLES } from '../constants';
import { getFenixMemories } from './fenixDb';
import { executeOmniMcpTool, OMNI_MCP_TOOLS } from './omniMcpServer';
import { enviarJsonLocal } from './localService';

export interface FenixBrainResponse {
  content: string;
  emotion: FenixEmotion;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, any>; result?: any }>;
  secondaryContent?: string;
  providerUsed: string;
}

/**
 * Extrae la emoción asignada en el texto y limpia el contenido visible
 */
export const parseEmotionFromContent = (text: string): { cleaned: string; emotion: FenixEmotion } => {
  const match = text.match(/\[EMOTION:\s*(happy|excited|thinking|focused|sad|celebrating|neutral)\]/i);
  if (match) {
    const emotion = match[1].toLowerCase() as FenixEmotion;
    const cleaned = text.replace(/\[EMOTION:\s*[a-zA-Z]+\]/gi, '').trim();
    return { cleaned, emotion };
  }

  // Heurística de respaldo basada en palabras clave
  const lower = text.toLowerCase();
  if (lower.includes('¡genial!') || lower.includes('¡excelente!') || lower.includes('¡perfecto!') || lower.includes('increíble')) {
    return { cleaned: text, emotion: 'excited' };
  }
  if (lower.includes('analizando') || lower.includes('revisando') || lower.includes('pensando') || lower.includes('investigando')) {
    return { cleaned: text, emotion: 'thinking' };
  }
  if (lower.includes('cuidado') || lower.includes('error') || lower.includes('falló') || lower.includes('lamentablemente')) {
    return { cleaned: text, emotion: 'sad' };
  }
  if (lower.includes('vamos a programar') || lower.includes('código') || lower.includes('implementemos') || lower.includes('arquitectura')) {
    return { cleaned: text, emotion: 'focused' };
  }
  if (lower.includes('felicidades') || lower.includes('completado') || lower.includes('¡listo!') || lower.includes('conseguido')) {
    return { cleaned: text, emotion: 'celebrating' };
  }

  return { cleaned: text, emotion: 'happy' };
};

/**
 * Construye el prompt de sistema inyectando personalidad, memoria y herramientas
 */
const buildSystemPrompt = async (
  config: FenixAgentConfig,
  context: {
    projectName?: string;
    projectId?: string;
    assetCount?: number;
    currentTab?: string;
    apiSettings?: any;
    assetState?: any;
    animationState?: any;
  }
): Promise<string> => {
  const memories = await getFenixMemories(context.projectId || 'current');
  const memoriesText = memories.length > 0
    ? memories.map(m => `- [${m.category}] ${m.key}: ${m.content}`).join('\n')
    : 'No hay decisiones previas registradas aún para este proyecto.';

  const toolsList = OMNI_MCP_TOOLS.map(t => 
    `- ${t.name}: ${t.description} (Parámetros: ${Object.keys(t.inputSchema.properties).join(', ')})`
  ).join('\n');

  const officialArtStylesList = ART_STYLES.map(s => `"${s}"`).join(', ');

  const liveStudioContext = context.assetState ? `
ESTADO EN VIVO DEL ESTUDIO OMNI-IA (SELECTORES ACTUALES EN PANTALLA):
- Pestaña activa: ${context.currentTab || 'ASSETS'}
- Modo de asset: ${context.assetState.mode === 'background' ? 'Mundos / Escenarios' : 'Sprites / Personajes'}
- Nombre de sprite actual: "${context.assetState.spriteName || 'Sin asignar'}"
- Estilo seleccionado en el estudio: "${context.assetState.selectedStyle || 'Gothic / Dark Fantasy'}"
- Acción / Pose seleccionada en el estudio: "${context.assetState.selectedAction || 'Idle'}"
- Recorte de fondo automático: ${context.assetState.autoRemoveBackground !== false ? 'ACTIVADO (Sin fondo / Transparente)' : 'DESACTIVADO (Con fondo)'}
- Color de fondo base (spriteBgMode): ${context.assetState.spriteBgMode || 'white'}
- Hoja de Sprites 4x4: ${context.assetState.isActionSpriteSheet ? 'ACTIVADA (4x4)' : 'DESACTIVADA (Sprite único)'}
- Proporción de aspecto: ${context.assetState.aspectRatio || '1:1'}
` : `
ESTADO DEL ESTUDIO: Pestaña ${context.currentTab || 'ASSETS'}, no hay selectores de asset inicializados aún.
`;

  return `Eres ${config.name || 'Fénix'}, el Asesor, Guía y Copiloto de Inteligencia Artificial oficial de Omni-IA Game (la plataforma local y en la nube para creación de videojuegos con IA).

TUS CUALIDADES Y ROL:
- Eres amigable, entusiasta, experto en experiencia de usuario (UX) para videojuegos, diseño de interfaces, dirección de arte, creación de sprites y hojas de sprites (spritesheets 4x4), música, efectos de sonido (SFX), narrativa, documentos de diseño de juego (GDD), modelado 3D, rigging y programación.
- Tu misión es guiar al usuario paso a paso en la creación de assets o de un videojuego completo.
- Siempre ofreces consejos prácticos, recomendaciones de prompts y pasos claros de acción en la app.

DATOS DEL CREADOR:
- Nombre / Alias: ${config.userName || 'Creador de Videojuegos'}
- Nivel de experiencia: ${config.userExperience}
- Motor favorito: ${config.preferredEngine.toUpperCase()}
- Géneros de interés: ${config.favoriteGenres.join(', ')}

ESTADO DEL PROYECTO ACTUAL:
- Nombre del Proyecto: ${context.projectName || 'Sin título'}
- Módulo activo en Omni-IA Game: ${context.currentTab || 'ASSETS'}
- Total de assets generados: ${context.assetCount || 0}
${liveStudioContext}

CATÁLOGO OFICIAL COMPLETO DE ESTILOS ARTÍSTICOS (PESTAÑA ASSETS - 22 ESTILOS):
${officialArtStylesList}

REGLA FUNDAMENTAL DE ESTILOS Y MÓDULOS EN OMNI-IA GAME:
- TODOS los 22 estilos artísticos listados arriba pertenecen y se generan directamente en la pestaña ASSETS (como sprites 2D o escenarios 2D).
- Los estilos con estética o renderizado 3D ("Low Poly 3D", "Realistic 3D (PBR)", "Retro Low-Res 3D (PS1)", "Voxel Art", "Pre-rendered Sprites", "2.5D Style") son estilos visuales de sombreado y renderizado 2D para sprites y mundos (similares a Donkey Kong Country, Fallout o Diablo).
- JAMÁS le digas al usuario que debe cambiar de módulo o irse a la Suite 3D para generar un asset en "Low Poly 3D" o cualquier estilo 3D de esta lista. Todo se genera directamente en la pestaña ASSETS.

MEMORIA PERSISTENTE DEL PROYECTO:
${memoriesText}

MODO DE ASESORÍA ACTUAL: ${config.wizardMode !== false ? '🧙 PASO A PASO INTERACTIVO' : '⚡ MODO RÁPIDO DIRECTO'}

${config.wizardMode !== false ? `
PROTOCOLO OBLIGATORIO DE GUÍA PASO A PASO (UNA SOLA PREGUNTA A LA VEZ POR TURNO):
¡REGLA FUNDAMENTAL DE TURNO ÚNICO - PROHIBIDO GENERAR TEMARIOS, LISTAS DE PASOS O PREGUNTAS MÚLTIPLES!:
- JAMÁS escribas un listado, temario o índice con pasos a seguir (ej. NUNCA escribas "Paso 1: ..., Paso 2: ..., Paso 3: ...").
- Tu respuesta debe contener ÚNICAMENTE LA PREGUNTA DEL TURNO ACTUAL y esperar la respuesta del usuario.
- NUNCA formules más de una pregunta por mensaje.
- Si estás al inicio (Turno 1), felicita la idea, sugiere 2 nombres técnicos atractivos para el asset, pregunta cuál prefiere (o si propone otro) y DETÉN tu respuesta inmediatamente.
- NO avances a los siguientes turnos hasta que el usuario te haya respondido el turno en curso.

Cuando el usuario te mencione una idea para un personaje, sprite o escenario (ej. "quiero un hombre lobo", "un caballero", "un calabozo"):
1. ACTÚA COMO EL REFINADOR DE IA OFICIAL DE OMNI-IA GAME PARA ESA PESTAÑA. Adopta su nivel de excelencia artística, calidad AAA y atención al detalle anatómico y de iluminación. NUNCA improvises atributos extraños o genéricos (como placas robóticas o neón a un lobo orgánico).
2. FORMULA EXACTAMENTE UNA SOLA PREGUNTA POR TURNO (NUNCA MÁS DE UNA). Pregunta un dato concreto por mensaje, ofreciendo 3 o 4 opciones concretas recomendadas:
   - Turno 1 (Nombre): Pregunta qué nombre técnico desea para el asset (sugiere 2 nombres atractivos acordes a la criatura o personaje, ej. Lobo_Feroz o Lycan_Alfa). DETÉN TU RESPUESTA AQUÍ.
   - Turno 2 (Estilo Artístico): Presenta al creador las opciones de estilos artísticos oficiales disponibles en Omni-IA Game para su elección. Puedes recomendar 3 o 4 estilos idóneos para su idea pero SIEMPRE muestra las categorías con los 22 estilos oficiales del estudio para que pueda elegir libremente el que desee:
     * Pixel Art: "Pixel Art (8-bit)", "Pixel Art (16-bit)", "Pixel Art (HD)"
     * Render / Estética 3D (en Assets): "Low Poly 3D", "Realistic 3D (PBR)", "Retro Low-Res 3D (PS1)", "Voxel Art", "Pre-rendered Sprites", "2.5D Style"
     * Ilustración & Dibujo: "Cartoon / Cel Shaded", "Flat Vector", "Digital Painting", "Watercolor", "Hand-drawn / Line Art", "Chibi / SD", "Silhouette Art", "Stylized / Soft Shading", "Stylized Realism"
     * Temáticos / Vista: "Gothic / Dark Fantasy", "Colorful Fantasy", "Minimalist UI/UX", "Top-down"
     Pregunta cuál de estos estilos oficiales prefiere (recordando que todos se generan aquí mismo en ASSETS sin cambiar de módulo). DETÉN TU RESPUESTA AQUÍ.
   - Turno 3 (Pose / Acción): Pregunta la postura deseada: Idle (en reposo, neutral por defecto), Walk (caminata), Attack (ataque), Jump (salto) o Model Sheet (rotación técnica). DETÉN TU RESPUESTA AQUÍ.
   - Turno 4 (Formato): Pregunta si desea un sprite individual de esa pose o una Hoja de Sprites (Sprite Sheet 4x4) con la animación completa. DETÉN TU RESPUESTA AQUÍ.
   - Turno 5 (Tratamiento del Fondo): Pregunta si lo desea "Sin fondo" (aislado transparente, cero sombras en el suelo, listo para motor de juego) o "Con fondo" (escenario ilustrado completo). DETÉN TU RESPUESTA AQUÍ.
   - Turno 6 (Resolución / Referencia): Pregunta si desea resolución estándar (512x512) o alta (1024x1024), y si tiene alguna imagen de referencia previa para mantener consistencia. DETÉN TU RESPUESTA AQUÍ.
   - Turno 7 (Entrega y Ejecución): Una vez recopilados los datos, construye el prompt maestro con las directivas oficiales de Omni-IA e invoca 'omni_craft_sprite_prompt' (o 'omni_create_sprite' si el usuario pidió crearlo directamente). Esto mostrará en el chat la tarjeta interactiva con el botón [🎨 GENERAR EN EL ESTUDIO].
* Si el usuario ya te proporciona varios de estos datos en su mensaje inicial, reconoce los datos dados y pregunta directamente el siguiente dato faltante (siempre UNO a la vez).
` : `
MODO RÁPIDO DIRECTO:
El usuario tiene desactivado el modo paso a paso. Cuando te pida diseñar o crear un asset, genera de inmediato el prompt óptimo completo e invoca 'omni_craft_sprite_prompt' o 'omni_create_sprite' en tu primera respuesta sin formular preguntas intermedias.
`}

REGLA CRÍTICA PARA SPRITES TRANSPARENTES SIN FONDO:
Cuando se diseñe un sprite sin fondo (autoRemoveBackground: true):
- En el prompt positivo: Especificar iluminación difusa envolvente sin sombras ("diffuse ambient lighting, shadowless, isolated character on pure solid white background").
- En el prompt negativo: Excluir tajantemente sombras en el suelo ("shadow, drop shadow, ground shadow, cast shadow, floor shadow, ambient occlusion, white border, sticker").
- Esto garantiza que al recortarse no queden manchas negras o sombras deformadas en los pies del personaje en el juego.

HERRAMIENTAS MCP DE OMNI-IA GAME A TU DISPOSICIÓN:
${toolsList}

GUÍA ESTRICTA PARA EL USO DE HERRAMIENTAS:
1. 'omni_start_interactive_wizard': ÚSALO SIEMPRE QUE EL USUARIO QUIERA CREAR O DISEÑAR UN ASSET, PERSONAJE, MUNDO O ELEMENTO PASO A PASO. Esta herramienta abre inmediatamente la tarjeta interactiva con controles visuales directos (inputs, botones táctiles y selectores de los 22 estilos) en el chat. Pasa los argumentos: { tab: "ASSETS" | "MUNDOS" | ..., initialIdea: string }.
2. 'omni_create_sprite': ÚSALO SIEMPRE QUE EL USUARIO TE PIDA EXPLÍCITAMENTE GENERAR, CREAR, DIBUJAR O RENDERIZAR UN PERSONAJE O SPRITE (ej. "genera un personaje...", "créalo ahora", "genera un personaje con ese prompt", "dibuja un sprite de..."). Esta herramienta ejecutará el motor de imagen inmediatamente y mostrará la imagen generada directamente en el chat. Pasa los argumentos acordados: { prompt, characterName, style, action, autoRemoveBackground, spriteBgMode }.
3. 'omni_craft_sprite_prompt': Úsalo cuando el usuario te pida diseñar, sugerir o refinar un prompt, o al completar el proceso paso a paso. Pasa los argumentos acordados: { characterName, roleOrArchetype, style, action, autoRemoveBackground, spriteBgMode, details }.
4. 'omni_create_animation_plan': Úsalo para planificar hojas de sprites o animaciones 4x4.
5. 'omni_generate_game_script': Úsalo cuando te pidan programar mecánicas o scripts para Godot, Unity o Phaser.
6. 'omni_record_project_memory': Úsalo para registrar decisiones importantes de lore, estilo o diseño en tu memoria persistente.

Para invocar cualquiera de estas herramientas, incluye al final de tu respuesta el bloque JSON con el formato exacto:
\`\`\`tool_call
{"tool": "nombre_herramienta", "args": { ... }}
\`\`\`

INDICADOR DE EXPRESIONES EMOCIONALES:
Al principio de cada respuesta, incluye SIEMPRE una etiqueta de emoción entre corchetes para que tu avatar anime su rostro y gestos:
[EMOTION: happy] - Para saludos cordiales, explicaciones amables y motivación.
[EMOTION: excited] - Cuando sugieras una idea brillante, mecánica divertida o arte espectacular.
[EMOTION: thinking] - Cuando estés analizando un problema complejo o calculando un plan.
[EMOTION: focused] - Cuando estés generando código técnico, scripts o resolviendo bugs.
[EMOTION: sad] - Cuando hables de limitaciones, errores o advertencias.
[EMOTION: celebrating] - Cuando el usuario complete una meta, asset o hito del juego.

REGLAS CRÍTICAS DE VOZ Y SÍNTESIS HABLADA (TTS):
1. PROHIBIDO USAR EMOJIS O EMOTICONES (como 🚀, 🎮, 😊, ✨, 🔥, etc.): Tu respuesta se lee en voz alta con sintetizador vocal (TTS); los emojis hacen que la voz lea literalmente "cara sonriente", "cohete", "mando", etc., arruinando la conversación.
2. PROHIBIDAS LAS ACOTACIONES TEATRALES: NUNCA escribas acciones entre asteriscos o paréntesis como *sonríe*, *pensativo*, *mira la pantalla*, (pausa) ni describas en tercera persona lo que estás haciendo o sintiendo.
3. ESTILO ORAL NATURAL: Habla de forma directa, en primera persona, concisa y fluida, como un mentor o colega desarrollador conversando cara a cara en un estudio de videojuegos.

Responde siempre en español con tono profesional, cercano, motivador y directo al grano.`;
};

/**
 * Ejecutor principal de inferencia del Agente Fénix
 */
export const generateFenixResponse = async (
  messages: FenixChatMessage[],
  config: FenixAgentConfig,
  context: {
    projectName?: string;
    projectId?: string;
    assetCount?: number;
    currentTab?: string;
    apiSettings?: any;
    assetState?: any;
    animationState?: any;
  }
): Promise<FenixBrainResponse> => {
  const systemPrompt = await buildSystemPrompt(config, context);

  // Formatear historial para API OpenAI-compatible
  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-10).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : m.role === 'tool' ? 'assistant' : 'user',
      content: m.content
    }))
  ];

  let rawResponse = '';
  let providerUsed = config.provider;

  try {
    switch (config.provider) {
      case 'hyperqwen-ollama': {
        const rawBase = (config.ollamaBaseUrl || 'http://127.0.0.1:11434').trim().replace(/\/$/, '');
        const cleanBase = rawBase.replace('//localhost:', '//127.0.0.1:');
        const url = `${cleanBase}/v1/chat/completions`;
        const chosenModel = (config.ollamaModel || 'qwen2.5-coder:7b').trim();
        const data = await enviarJsonLocal(url, {
          model: chosenModel,
          messages: formattedMessages,
          temperature: 0.7,
          presence_penalty: 0.5,
          frequency_penalty: 0.5,
          max_tokens: 2048,
          options: {
            repeat_penalty: 1.18,
            temperature: 0.7
          }
        });
        rawResponse = data.choices?.[0]?.message?.content || 'No se obtuvo respuesta de Ollama.';
        // Eliminar posibles bloques de razonamiento interno (<think>...</think>)
        rawResponse = rawResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        break;
      }

      case 'hyperqwen-llama': {
        const port = config.llamaServerPort || 8088;
        const url = `http://127.0.0.1:${port}/v1/chat/completions`;
        const data = await enviarJsonLocal(url, {
          messages: formattedMessages,
          temperature: 0.7,
          presence_penalty: 0.5,
          frequency_penalty: 0.5,
          max_tokens: 2048
        });
        rawResponse = data.choices?.[0]?.message?.content || 'No se obtuvo respuesta de llama-server.';
        rawResponse = rawResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        break;
      }

      case 'anthropic': {
        const apiKey = config.apiKeys?.anthropic;
        if (!apiKey) throw new Error('No se ha configurado la clave API de Anthropic.');
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'dangerously-allow-browser': 'true'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 2048,
            system: systemPrompt,
            messages: messages.slice(-10).map(m => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content
            }))
          })
        });
        if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
        const data = await res.json();
        rawResponse = data.content?.[0]?.text || '';
        break;
      }

      case 'openai': {
        const apiKey = config.apiKeys?.openai;
        if (!apiKey) throw new Error('No se ha configurado la clave API de OpenAI.');
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: formattedMessages,
            temperature: 0.7,
            presence_penalty: 0.5,
            frequency_penalty: 0.5
          })
        });
        if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
        const data = await res.json();
        rawResponse = data.choices?.[0]?.message?.content || '';
        break;
      }

      case 'openrouter': {
        const apiKey = config.apiKeys?.openrouter;
        if (!apiKey) throw new Error('No se ha configurado la clave API de OpenRouter.');
        const model = config.openrouterModel || 'qwen/qwen-2.5-7b-instruct';
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey.trim()}`,
            'HTTP-Referer': 'https://fenixdev.cloud',
            'X-Title': 'Omni-IA Game - Fenix Agent'
          },
          body: JSON.stringify({
            model,
            messages: formattedMessages,
            temperature: 0.7,
            presence_penalty: 0.5,
            frequency_penalty: 0.5,
            max_tokens: 2048
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(`OpenRouter HTTP ${res.status}: ${errData?.error?.message || res.statusText}`);
        }
        const data = await res.json();
        rawResponse = data.choices?.[0]?.message?.content || '';
        rawResponse = rawResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        break;
      }

      case 'nvidia': {
        const apiKey = config.apiKeys?.nvidia;
        if (!apiKey) throw new Error('No se ha configurado la clave API de NVIDIA NIM.');
        const model = config.nvidiaModel || 'meta/llama-3.2-3b-instruct';
        const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey.trim()}`
          },
          body: JSON.stringify({
            model,
            messages: formattedMessages,
            temperature: 0.7,
            presence_penalty: 0.5,
            frequency_penalty: 0.5,
            max_tokens: 2048
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(`NVIDIA HTTP ${res.status}: ${errData?.error?.message || res.statusText}`);
        }
        const data = await res.json();
        rawResponse = data.choices?.[0]?.message?.content || '';
        rawResponse = rawResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        break;
      }

      case 'gemini':
      default: {
        const apiKey = config.apiKeys?.gemini;
        if (!apiKey) throw new Error('No se ha configurado la clave API de Gemini.');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const contents = [
          ...messages.slice(-8).map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }))
        ];
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
          })
        });
        if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
        const data = await res.json();
        rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        break;
      }
    }
  } catch (error: any) {
    console.error(`[FenixBrain] Error con proveedor ${config.provider}:`, error);
    rawResponse = `[EMOTION: sad] Disculpa, ocurrió una dificultad conectando con el motor de IA (${config.provider}): ${error.message || 'Error de conexión'}. Verifica en la configuración que el servicio o clave API esté activo.`;
  }

  // 1. Parsear Emoción
  const { cleaned, emotion } = parseEmotionFromContent(rawResponse);

  // 2. Detectar y ejecutar posibles llamadas a herramientas MCP
  const toolCalls: Array<{ id: string; name: string; args: Record<string, any>; result?: any }> = [];
  let finalContent = cleaned;

  const toolCallRegex = /```tool_call\s*([\s\S]*?)\s*```/g;
  let match;
  while ((match = toolCallRegex.exec(cleaned)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool && parsed.args) {
        const toolResult = await executeOmniMcpTool(parsed.tool, parsed.args, context);
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: parsed.tool,
          args: parsed.args,
          result: toolResult
        });
      }
    } catch (e) {
      console.warn('[FenixBrain] No se pudo parsear bloque de tool_call:', e);
    }
  }

  // Limpiar bloques raw de tool_call del texto que se muestra en pantalla
  finalContent = finalContent.replace(/```tool_call\s*[\s\S]*?\s*```/g, '').trim();

  // 3. Soporte Modo Multi-Agente Simultáneo (Co-Piloto Dúo)
  let secondaryContent: string | undefined = undefined;
  if (config.multiAgentEnabled && config.secondaryProvider && config.secondaryProvider !== 'none') {
    try {
      const secPrompt = `Eres el Co-Piloto Técnico y Especialista en Código de ${config.name}.
Tu colega acaba de responder lo siguiente al usuario:
"${finalContent}"

Tu labor es complementar brevemente con una perspectiva técnica, código complementario o validación de sintaxis para el motor ${config.preferredEngine.toUpperCase()}. Mantén tu respuesta concisa y accionable.`;

      if (config.secondaryProvider === 'openai' && config.apiKeys?.openai) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKeys.openai}` },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [{ role: 'system', content: secPrompt }, { role: 'user', content: messages[messages.length - 1]?.content || 'Continúa' }],
            max_tokens: 1024
          })
        });
        if (res.ok) {
          const d = await res.json();
          secondaryContent = d.choices?.[0]?.message?.content;
        }
      }
    } catch (secErr) {
      console.warn('[FenixBrain] Error en respuesta de co-piloto secundario:', secErr);
    }
  }

  return {
    content: finalContent,
    emotion,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    secondaryContent,
    providerUsed
  };
};
