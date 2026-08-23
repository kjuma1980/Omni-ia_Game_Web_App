export interface TooltipInfo {
  title: string;
  description: string;
  shortcut?: string;
}

export const TOOLTIPS: Record<string, TooltipInfo> = {
  // === Tabs de la Barra de Navegación ===
  tabAssets: {
    title: "Módulo de Assets & Mundos",
    description: "Crea y refina sprites de personajes, keyframes base 2D y escenarios panorámicos en 360 grados usando motores locales o cloud."
  },
  tabAnimation: {
    title: "Módulo de Animación & Video HD",
    description: "Convierte imágenes estáticas en bucles de movimiento retro mediante Sprite Sheets (4x4) o genera videos HD ultra fluidos usando SVD y AnimateDiff."
  },
  tabNpcs: {
    title: "Estudio de NPCs",
    description: "Crea personajes no jugables con su personalidad, trasfondo y árbol de diálogos. El modelo de lenguaje escribe sus respuestas; tú fijas quién es y qué sabe."
  },
  tabThreeD: {
    title: "Suite 3D",
    description: "Genera mallas 3D a partir de un texto o de una imagen de referencia, listas para importar en Unity, Godot o Unreal."
  },
  tabNarrative: {
    title: "Módulo Narrativo & Mezclador",
    description: "Redacta guiones dramáticos y diálogos bilingües con IA. Genera locución (TTS) local, añade pistas de música de fondo y efectos para exportar la mezcla definitiva."
  },
  tabScripts: {
    title: "Asistente de Código C#",
    description: "Entrena y consulta a un programador de IA experto en Unity y Godot. Escribe requerimientos lógicos y obtén scripts optimizados al instante."
  },
  tabAudio: {
    title: "Diseño de Sonido y Música (Sonic Forge)",
    description: "Escribe prompts musicales detallados para sintetizar efectos ambientales, loops inmersivos o pistas de música de larga duración con MusicGen."
  },

  // === ComfyUI Footer / Status Bar ===
  comfyLaunch: {
    title: "Lanzar Servidor ComfyUI",
    description: "Inicia el servidor local de ComfyUI en tu computadora para procesar la síntesis de imágenes y videos localmente."
  },
  comfyStop: {
    title: "Forzar Detención de ComfyUI",
    description: "Cierra de forma segura el proceso del servidor local ComfyUI que se ejecuta en segundo plano."
  },
  comfyConsole: {
    title: "Mostrar Consola de Salida",
    description: "Abre el panel flotante de logs para monitorear en tiempo real la terminal del servidor de ComfyUI y depurar errores."
  },

  // === Tab: ASSETS ===
  assetModeSprite: {
    title: "Modo Sprite / Personaje",
    description: "Genera personajes, héroes o entidades individuales listos para ser animados en 2D."
  },
  assetModeBackground: {
    title: "Modo Escenario / Background",
    description: "Genera fondos panorámicos, texturas o entornos completos para tu videojuego."
  },
  assetSpriteName: {
    title: "Nombre del Personaje",
    description: "El nombre o identificador de tu personaje para catalogarlo en tu biblioteca de assets."
  },
  assetWorldName: {
    title: "Nombre del Escenario",
    description: "El nombre o identificador del entorno que vas a generar (ej: Bosque Sombrío)."
  },
  assetStyle: {
    title: "Estilo Artístico",
    description: "Elige la estética visual del asset (Pixel Art 16-bit, Low Poly, Pintura Digital, Voxel, etc.)."
  },
  assetAction: {
    title: "Acción de Referencia",
    description: "La pose inicial o acción del personaje que servirá como keyframe base (Idle, Walk, Attack, etc.)."
  },
  assetSpritePrompt: {
    title: "Descripción Detallada (Sprite)",
    description: "Detalla la apariencia del personaje: ropa, colores, armas y rasgos faciales distintivos."
  },
  assetWorldPrompt: {
    title: "Descripción Detallada (Background)",
    description: "Detalla la atmósfera, iluminación, elementos interactivos y la paleta de colores del escenario."
  },
  assetNegativePrompt: {
    title: "Prompt Negativo",
    description: "Especifica las características no deseadas que la IA debe excluir (ej: texto, distorsiones, marcas de agua)."
  },
  assetConsistency: {
    title: "Consistencia Visual",
    description: "Fuerza a la IA a basarse en un boceto subido o en el último asset generado para mantener la identidad visual."
  },
  assetUploadRef: {
    title: "Subir Boceto o Referencia",
    description: "Carga una imagen local desde tu computadora para que la IA la tome como guía de forma, pose y colores."
  },
  assetAutoRemoveBg: {
    title: "Quitar Fondo Automático",
    description: "Aplica postprocesamiento de IA para aislar al personaje quitando el fondo de forma limpia (transparencia PNG)."
  },
  assetAutoSlice: {
    title: "Corte Automático (Slicing)",
    description: "Detecta los márgenes del personaje y recorta la imagen al tamaño exacto de la caja de colisión del sprite."
  },
  assetRefinePromptBtn: {
    title: "✨ Refinar Prompt con IA",
    description: "Activa al Prompt Engineer autónomo para expandir tu descripción simple agregando especificaciones técnicas de alta calidad."
  },
  assetGenerateBtn: {
    title: "Generar Asset con IA",
    description: "Invoca al motor de generación de imágenes (ComfyUI local o Gemini Cloud) con los parámetros configurados."
  },
  assetDownloadPng: {
    title: "Descargar Imagen PNG",
    description: "Guarda la imagen generada en formato PNG con la resolución completa."
  },

  // === Tab: ANIMATION ===
  animType: {
    title: "Tipo de Animación",
    description: "Elige el movimiento exacto del personaje que deseas generar (ej: Walk Cycle, Jump, Sword Attack)."
  },
  animStyle: {
    title: "Estilo Visual",
    description: "Alinea el estilo visual de la animación con la estética artística general del proyecto."
  },
  animConsistency: {
    title: "Consistencia Visual",
    description: "Utiliza el keyframe o boceto de referencia para asegurar que el personaje no cambie de apariencia al moverse."
  },
  animUploadRef: {
    title: "Subir Referencia Manual",
    description: "Sube un boceto específico que define el diseño estático del personaje a animar."
  },
  animPrinciples: {
    title: "Principios Clásicos de Animación",
    description: "Selecciona los principios de Disney (como Squash & Stretch, Arcs, Timing) para aplicarlos a la simulación física."
  },
  animCharDesc: {
    title: "Descripción Físico-Estética",
    description: "Describe detalladamente al personaje que va a realizar la acción para conservar sus colores y ropas."
  },
  animNegativePrompt: {
    title: "Prompt Negativo de Animación",
    description: "Especifica los detalles no deseados, distorsiones físicas, o textos que deseas excluir de la animación generada."
  },
  animGenerateKeyframeBtn: {
    title: "Generar Keyframe Base",
    description: "Crea el fotograma estático inicial del personaje en la pose y acción configurada."
  },
  animGenerateGifBtn: {
    title: "Generar Sprite Sheet (4x4)",
    description: "Genera una cuadrícula de 16 frames y simula la animación reproduciéndola en bucle (Bajo consumo de API)."
  },
  animGenerateVideoBtn: {
    title: "Generar Video HD",
    description: "Utiliza modelos de video (Veo o SVD/AnimateDiff) para generar movimiento ultrarrápido y realista."
  },
  animDownloadPng: {
    title: "Descargar PNG del Keyframe",
    description: "Descarga el fotograma base del personaje."
  },
  animDownloadMp4: {
    title: "Descargar Video MP4",
    description: "Guarda la animación generada en video MP4 de alta definición para tu motor de juego."
  },
  animDownloadSprite: {
    title: "Descargar Sprite Sheet PNG",
    description: "Guarda la hoja de sprites de 16 fotogramas (4x4) lista para importar a Unity, Godot o Unreal."
  },
  animVideoControls: {
    title: "Controles de Video HD",
    description: "Reproduce, pausa, detén o avanza fotograma a fotograma para analizar la fluidez de la animación generada."
  },
  animSpriteFps: {
    title: "Velocidad de Simulación (FPS)",
    description: "Ajusta la velocidad de reproducción del bucle simulado (ej: 5 FPS para retro, 24 FPS para fluidez moderna)."
  },

  // === Tab: NARRATIVE ===
  narrativeIdea: {
    title: "Idea Semilla del Guion",
    description: "Ingresa una idea básica o el concepto general del diálogo/evento que deseas narrar en el juego."
  },
  narrativeAIExpansion: {
    title: "Expansión Inteligente por IA",
    description: "Usa el LLM configurado para enriquecer tu idea básica, convirtiéndola en un guion estructurado con matices dramáticos."
  },
  narrativeVoice: {
    title: "Entidad de Voz (Personaje)",
    description: "Selecciona el actor de voz o criatura virtual para el narrador o personaje (ej: Heroic Male, Goblin, Dark Lord)."
  },
  narrativeVoiceAccent: {
    title: "Selector de Acento Regional",
    description: "Alterna el acento de la voz del narrador local entre Español de México (es-MX) y Español de España (es-ES)."
  },
  narrativeSpeed: {
    title: "Velocidad de Habla",
    description: "Ajusta el ritmo del habla (tempo). 1.0 es velocidad estándar. Valores menores ralentizan la locución."
  },
  narrativeEnthusiasm: {
    title: "Entusiasmo / Expresividad",
    description: "Ajusta la entonación y expresividad del locutor. Un valor bajo suena serio/plano; un valor alto suena enérgico."
  },
  narrativeVolume: {
    title: "Volumen de Voz del Narrador",
    description: "Ajusta de forma lineal el volumen de la pista de voz sintetizada del narrador o entidad de voz."
  },
  narrativeMonsterize: {
    title: "Efecto Especial de Modulación",
    description: "Aplica modulación física en tiempo real para oscurecer y distorsionar la voz, dándole propiedades monstruosas o fantasmales."
  },
  narrativeSfxChannel: {
    title: "Canal de Efectos (SFX)",
    description: "Control principal del canal de efectos especiales. Mezcla sonidos de fondo ambientales con las locuciones generadas."
  },
  narrativeSfxVol: {
    title: "Volumen de Efectos (SFX)",
    description: "Ajusta el volumen del canal SFX independiente para equilibrar el sonido de fondo respecto al narrador."
  },
  narrativeSfxFile: {
    title: "Cargar Efecto Especial local",
    description: "Sube un archivo de audio (.wav/.mp3) con los ruidos y efectos de sonido que deseas mezclar."
  },
  narrativeMusicChannel: {
    title: "Canal de Música de Fondo",
    description: "Control de reproducción y mezcla de pistas melódicas. Integra bandas sonoras inmersivas por debajo del diálogo."
  },
  narrativeMusicVol: {
    title: "Volumen de Música de Fondo",
    description: "Modifica el volumen del canal de música de fondo para evitar que opaque el diálogo del personaje."
  },
  narrativeMusicFile: {
    title: "Cargar Música de Fondo local",
    description: "Sube tu archivo de audio de música local (.wav/.mp3) para que la IA lo mezcle con el diálogo y los efectos."
  },
  narrativeSpainSpanish: {
    title: "Versión de Voz (ES)",
    description: "Genera el doblaje en Español usando el modelo seleccionado y los parámetros de entonación."
  },
  narrativeEnglish: {
    title: "Versión de Voz (EN)",
    description: "Genera el doblaje en Inglés usando el modelo seleccionado y los parámetros de entonación."
  },
  narrativeSfxDesc: {
    title: "Diseño de Efectos Sonoros (SFX)",
    description: "Describe los sonidos de fondo y efectos ambientales que acompañarán la narración (ej: pasos, relámpagos)."
  },
  narrativeMusicDesc: {
    title: "Diseño de Banda Sonora",
    description: "Describe el estilo musical y el ritmo melódico que servirá de atmósfera de fondo."
  },
  narrativeComposeBtn: {
    title: "Fijar Guión Dual",
    description: "Genera las versiones de texto del guión en español e inglés técnico de videojuegos, fijándolas para la síntesis de voz."
  },
  narrativeGenerateAudioBtn: {
    title: "Generar Audio Dual (ES + EN)",
    description: "Sintetiza locuciones de alta calidad para ambos idiomas basándose en el guion fijado y la voz seleccionada."
  },
  narrativeGenerateTTSES: {
    title: "Generar Voz en Español",
    description: "Genera el archivo de audio con locución en Español para el guion correspondiente."
  },
  narrativeGenerateTTSEN: {
    title: "Generar Voz en Inglés",
    description: "Genera el archivo de audio con locución en Inglés para el guion correspondiente."
  },
  narrativePlayEs: {
    title: "Reproducir Audio Mezclado (ES)",
    description: "Escucha la locución final en Español con todos los efectos (Monsterize, SFX y Música) aplicados."
  },
  narrativePlayEn: {
    title: "Reproducir Audio Mezclado (EN)",
    description: "Escucha la locución final en Inglés con todos los efectos (Monsterize, SFX y Música) aplicados."
  },
  narrativeDownloadFormat: {
    title: "Selector de Formato de Salida",
    description: "Alterna el formato final de tus archivos de audio descargables entre WAV (Calidad estudio) y MP3 (Web ligero)."
  },
  narrativeDownloadEs: {
    title: "Descargar Mezcla en Español",
    description: "Guarda en tu disco duro el audio generado para el guion en español con el nombre de voz prefijado."
  },
  narrativeDownloadEn: {
    title: "Descargar Mezcla en Inglés",
    description: "Guarda en tu disco duro el audio generado para el guion en inglés con el nombre de voz prefijado."
  },
  narrativePlayAudio: {
    title: "Reproducir Locución",
    description: "Escucha la voz sintetizada directamente en la aplicación."
  },
  narrativeDownloadWav: {
    title: "Descargar Audio WAV",
    description: "Descarga el audio generado con calidad de estudio sin compresión."
  },
  narrativeDownloadMp3: {
    title: "Descargar Audio MP3",
    description: "Descarga el audio en un formato altamente comprimido y compatible con web."
  },
  narrativeAudioEffect: {
    title: "Efecto de Audio Especial",
    description: "Aplica filtros digitales en tiempo real (monstruo, radio retro, susurro, etc.) al reproducir el audio."
  },

  // === Tab: SCRIPTS ===
  codePreset: {
    title: "Preset de Prompt C#",
    description: "Haz clic para cargar plantillas de código comunes en Unity (ej: Cámara 2.5D, Flashlight, Colisiones)."
  },
  codeInputText: {
    title: "Especificación de Requerimientos",
    description: "Describe con precisión matemática o lógica el script de C# que necesitas para Unity o Godot."
  },
  codeQuery: {
    title: "Especificación de Requerimientos",
    description: "Describe con precisión matemática o lógica el script de C# que necesitas para Unity o Godot."
  },
  codeSendBtn: {
    title: "Enviar y Compilar por IA",
    description: "Envía tu requerimiento al modelo LLM para compilar y formatear el código C# optimizado."
  },
  codeRefineBtn: {
    title: "✨ Refinar Requerimiento con IA",
    description: "Usa el Prompt Engineer para detallar, modularizar y estructurar tu lógica C# antes de enviarla."
  },

  // === Tab: AUDIO ===
  audioCategory: {
    title: "Categoría de Audio",
    description: "Alterna entre generar efectos de sonido (SFX) o pistas de música estructuradas (vocal o instrumental)."
  },
  audioTitle: {
    title: "Título de la Pista",
    description: "Establece el nombre del archivo de audio resultante."
  },
  audioPrompt: {
    title: "Descripción del Audio",
    description: "Describe el sonido o la canción deseada de forma rica y detallada."
  },
  audioLyrics: {
    title: "Letra de la Canción (Lyrics)",
    description: "Escribe la letra que la IA cantará. Solo se usa cuando el modo Vocal está activo."
  },
  audioLanguage: {
    title: "Idioma de Generación",
    description: "Selecciona el idioma en el que la IA generará la canción vocal o instrumental."
  },
  audioInstrumental: {
    title: "Solo Instrumental",
    description: "Fuerza a la IA a excluir voces humanas, coros o canto de la pista de música generada."
  },
  audioGenre: {
    title: "Género Musical",
    description: "Elige la base rítmica de la música (Ambient, Epic Orchestral, Rock, Techno, etc.)."
  },
  audioStyle: {
    title: "Atmósfera / Sentimiento",
    description: "Determina el tono emocional de la pista de audio (Dark, Upbeat, Retro, Calm, Intense)."
  },
  audioSingerGender: {
    title: "Género de la Voz Vocal",
    description: "Si no es instrumental, define si deseas que la melodía incluya voces masculinas o femeninas."
  },
    audioDuration: {
    title: "Duración en Segundos",
    description: "Establece la duración exacta del audio que se va a generar (máximo 600 segundos)."
  },
  audioBpm: {
    title: "Tempo de la Canción (BPM)",
    description: "Define el tempo en pulsaciones por minuto (BPM). Se utiliza para calibrar matemáticamente la estimación del tiempo según la estructura lírica."
  },
  audioInjectDuration: {
    title: "Forzar Duración en el Workflow",
    description: "Si está activo, Omni IA Game sobrescribirá la duración y segundos en el workflow de ComfyUI. Si está desactivado, el workflow usará sus valores internos preestablecidos."
  },
  audioGenerateBtn: {
    title: "Generar Audio por IA",
    description: "Invoca al modelo de síntesis local (ComfyUI) o cloud para crear el archivo de audio."
  },
  audioPlayBtn: {
    title: "Reproducir Audio Generado",
    description: "Escucha la pista musical o efecto de sonido sintetizado."
  },
  audioStopBtn: {
    title: "Detener Reproducción",
    description: "Detiene la reproducción actual del audio generado."
  },
  audioDownloadBtn: {
    title: "Descargar Audio",
    description: "Guarda la pista resultante en tu ordenador en el formato seleccionado (WAV o MP3)."
  },
  audioFormatSelector: {
    title: "Formato de Descarga",
    description: "Selecciona el formato de archivo de audio para la descarga (WAV sin compresión o MP3)."
  },
  audioVolumeControl: {
    title: "Control de Volumen",
    description: "Ajusta el volumen de reproducción del audio generado."
  },
  sfxRefinePromptBtn: {
    title: "✨ Refinar SFX con IA",
    description: "Optimiza y enriquece la descripción del efecto de sonido usando el Prompt Engineer para mejores resultados en MusicGen/ComfyUI."
  },
  audioSoundscapeToggle: {
    title: "Modo Ambiente / Soundscape",
    description: "Activa el modo de paisaje sonoro continuo. Configura por defecto 60 segundos de duración, tempo lento y excluye instrumentos/voces."
  },
  musicRefinePromptBtn: {
    title: "✨ Refinar Música con IA",
    description: "Usa el Prompt Engineer para optimizar la descripción de la melodía, instrumentación y atmósfera musical."
  },
  musicRefineLyricsBtn: {
    title: "✍️ Refinar Letra",
    description: "Utiliza la IA para componer, rimar o pulir la letra de tu canción bilingüe en español e inglés."
  },

  // === Configuración de APIs / SettingsModal ===
  settingsTextProvider: {
    title: "Proveedor de Texto y Lógica",
    description: "Elige la IA para generar ideas, guiones, diálogos y código C# (Gemini Cloud, OpenAI, Ollama Local, etc.)."
  },
  settingsTextApiKey: {
    title: "API Key de Texto (Lógica)",
    description: "Llave de acceso del proveedor (Opcional si usas el servicio gratuito por defecto o local)."
  },
  settingsTextServerToggle: {
    title: "Alternar Servidor Local / Cloud",
    description: "Elige si conectarás con una API en la nube del proveedor o a una instancia local en tu PC."
  },
  settingsTextServerUrl: {
    title: "Dirección de Endpoint (Servidor)",
    description: "La URL local o personalizada donde corre tu API compatible (ej: http://localhost:11434)."
  },
  settingsTextModel: {
    title: "Modelo de Lenguaje (Lógica)",
    description: "El modelo de red neuronal específico a utilizar para la generación y razonamiento."
  },
  settingsPromptEngineerToggle: {
    title: "Prompt Engineer Pro (Brain Optimization)",
    description: "Habilita que una IA optimice tus prompts descriptivos añadiendo detalles técnicos automáticamente."
  },
  settingsImageProvider: {
    title: "Proveedor de Imágenes",
    description: "Elige el motor de generación de imágenes (ComfyUI local, Stable Diffusion, o APIs Cloud)."
  },
  settingsImageUrl: {
    title: "Dirección del Servidor de Imágenes",
    description: "La URL base de la API de tu motor de generación local (por defecto: http://127.0.0.1:8188)."
  },
  settingsImageWorkflowId: {
    title: "ID de Flujo ComfyUI (Imagen)",
    description: "Identificador del workflow ComfyUI a usar para la síntesis de sprites y texturas."
  },
  settingsComfyuiWorkflow: {
    title: "ID de Flujo ComfyUI (Imagen)",
    description: "Identificador del workflow ComfyUI a usar para la síntesis de sprites y texturas."
  },
  settingsVideoProvider: {
    title: "Proveedor de Video",
    description: "Elige el motor para generar animaciones y transiciones de video (ComfyUI o APIs Cloud)."
  },
  settingsVideoUrl: {
    title: "Dirección del Servidor de Video",
    description: "La URL base de la API para el motor de video local (ej: ComfyUI, SVD)."
  },
  settingsVideoWorkflowId: {
    title: "ID de Flujo ComfyUI (Video)",
    description: "Identificador del workflow ComfyUI para generar animaciones fluidas (AnimateDiff)."
  },
  settingsVideoCustomWorkflow: {
    title: "Workflow JSON de Animación",
    description: "Carga un workflow local JSON de ComfyUI (ej. SVD o AnimateDiff) para inyectar los prompts, semillas y la imagen de consistencia de forma directa y automatizada."
  },
  settingsVideoPromptNode: {
    title: "Nodo de Prompt Positivo",
    description: "Especifica el título exacto o la clase del nodo de prompt de texto positivo en tu workflow (ej. CLIPTextEncode, o el título que le diste, como '#prompt')."
  },
  settingsVideoNegativeNode: {
    title: "Nodo de Prompt Negativo",
    description: "Especifica el título exacto o la clase del nodo de prompt negativo en tu workflow (ej. CLIPTextEncode, o el título personalizado, como '#negative')."
  },
  settingsVideoImageNode: {
    title: "Nodo de Imagen de Referencia",
    description: "Especifica el título o la clase del nodo que carga la imagen inicial o de referencia (ej. LoadImage, LoadImageBase64 o '#reference')."
  },
  settingsAudioTtsProvider: {
    title: "Proveedor de Voz (TTS)",
    description: "Elige el motor de locución: Gemini Cloud, ElevenLabs, VibeVoice (ComfyUI) o Edge TTS Local."
  },
  settingsAudioTtsUrl: {
    title: "Dirección del Servidor TTS",
    description: "URL del servidor de locución local (ej: http://localhost:5000 para Edge TTS o http://localhost:5001 para VibeVoice)."
  },
  settingsAudioTtsModel: {
    title: "Modelo de Voz o Nodo Destino",
    description: "El modelo de voz a cargar (Edge TTS) o el identificador del nodo de entrada de texto en ComfyUI."
  },
  settingsAudioTtsWorkflow: {
    title: "Cargar Workflow JSON de Voz",
    description: "Sube un archivo de configuración de flujo de ComfyUI (.json) específico para la clonación o síntesis de voz."
  },
  settingsAudioMusicProvider: {
    title: "Proveedor de Música & Efectos",
    description: "Elige el motor de composición (MusicGen local, Suno, APIs Cloud, etc.)."
  },
  settingsAudioMusicApiKey: {
    title: "Clave de API para Música",
    description: "Introduce la API Key para autenticarte con el proveedor de música seleccionado (Suno/Udio)."
  },
  settingsAudioMusicUrl: {
    title: "Dirección de Servidor de Música",
    description: "La URL local de la API para la generación de música (MusicGen/ComfyUI)."
  },
  settingsAudioMusicModel: {
    title: "Modelo Musical / Nodo Destino",
    description: "El checkpoint o tamaño del modelo a usar (musicgen-medium) o el título del nodo Prompt de música en ComfyUI."
  },
  settingsAudioMusicWorkflow: {
    title: "Cargar Workflow JSON de Música",
    description: "Sube un archivo de configuración de flujo de ComfyUI (.json) específico para la generación de bandas sonoras."
  },
  settingsAudioSfxModel: {
    title: "Modelo SFX / Nodo Destino",
    description: "El checkpoint o tamaño del modelo o el título del nodo Prompt de SFX en ComfyUI/A1111."
  },
  settingsAudioSfxWorkflow: {
    title: "Cargar Workflow JSON de SFX",
    description: "Sube un archivo de configuración de flujo de ComfyUI (.json) específico para la generación de efectos de sonido (SFX)."
  },
  
  // === 3D Suite / ThreeDStudio ===
  threedRefinePromptBtn: {
    title: "✨ Refinar Prompt 3D",
    description: "Usa la IA para optimizar el prompt descriptivo, añadiendo detalles estéticos, de sombreado y malla para una generación 3D impecable."
  },
  threedUseConsistentSprite: {
    title: "Usar Sprite Consistente",
    description: "Importa de forma inteligente la última imagen base de personaje generada en la bóveda de assets para usarla como referencia de forma y coherencia en el modelo 3D."
  },
  threedUploadRefImage: {
    title: "Subir Imagen de Referencia",
    description: "Carga un archivo de imagen local (PNG/JPG) de tu personaje para guiar la forma tridimensional y colores en la simulación 3D."
  },
  threedPositivePrompt: {
    title: "Prompt Positivo 3D",
    description: "Describe en detalle el modelo tridimensional: texturas, materiales, nivel de detalle de malla y estilo (ej: low poly, voxel, glass knight)."
  },
  threedNegativePrompt: {
    title: "Prompt Negativo 3D",
    description: "Especifica características a excluir del renderizado 3D (ej: deformaciones de malla, baja calidad, artefactos visuales)."
  },
  threedGenerateBtn: {
    title: "Generar Modelo 3D",
    description: "Envía el workflow y la imagen base a ComfyUI local o al modelador cloud para crear el archivo 3D (.glb / .gltf) interactivo."
  },
  threedTabGenTexturizing: {
    title: "Generación y Texturizado",
    description: "Módulo principal para modelar la geometría tridimensional de malla inicial y proyectar mapas de texturas coloridos."
  },
  threedTabRiggingAnimation: {
    title: "Rigging y Animación 3D",
    description: "Añade un esqueleto virtual (huesos) a tu modelo 3D y genera secuencias de movimiento en tres dimensiones."
  },
  threedSubtabGen: {
    title: "3D GEN (Malla Inicial)",
    description: "Diseño y modelado de la malla poligonal tridimensional estática a partir de un prompt e imagen de referencia."
  },
  threedSubtabTexturize: {
    title: "TEXTURIZE (Texturas)",
    description: "Genera y proyecta mapas UV y de texturas fotorrealistas sobre la malla 3D generada."
  },
  threedSubtabRigging: {
    title: "RIGGING (Esqueleto)",
    description: "Aplica esqueleto autónomo (huesos y articulaciones) a tu modelo 3D para prepararlo para la animación."
  },
  threedSubtabAnimation: {
    title: "3D ANIMATION",
    description: "Genera y previsualiza clips de movimiento tridimensionales (caminar, correr, atacar) en el visor interactivo."
  },

  // === 3D settings ===
  settingsThreeDProvider: {
    title: "Proveedor de 3D",
    description: "Elige la IA para el modelador 3D: Tripo 3D, Meshy (servicios Cloud) o ComfyUI / A1111 (servidores locales)."
  },
  settingsThreeDApiKey: {
    title: "API Key de 3D",
    description: "Ingresa tu clave de acceso autorizada para Tripo 3D o Meshy (necesario solo en modo Cloud)."
  },
  settingsThreeDModel: {
    title: "Calidad / Versión del Modelo 3D",
    description: "Alterna la versión de la red neuronal para lograr mayor detalle o velocidad en la malla tridimensional."
  },
  settingsThreeDWorkflowId: {
    title: "Workflow ID para 3D",
    description: "El identificador por defecto o nombre del workflow de 3D a usar en tu motor local ComfyUI/A1111."
  },
  settingsThreeDWorkflow: {
    title: "Cargar Workflow JSON de 3D",
    description: "Sube tu archivo de workflow JSON de ComfyUI (API format) para la generación y extrusión de mallas 3D locales."
  },

  // === NPCs settings ===
  settingsNpcsProvider: {
    title: "Proveedor de NPCs",
    description: "Elige el motor de IA para el razonamiento e inteligencia de tus NPCs (Gemini Cloud, OpenAI, Ollama Local, etc.)."
  },
  settingsNpcsApiKey: {
    title: "API Key de NPCs",
    description: "Clave de acceso opcional para el proveedor de NPCs (vacío para usar la clave global o local)."
  },
  settingsNpcsServerToggle: {
    title: "Alternar Local / Cloud (NPCs)",
    description: "Elige si conectarás con una API en la nube del proveedor o a una instancia local de Ollama/LM-Studio en tu PC para tus agentes NPCs."
  },
  settingsNpcsServerUrl: {
    title: "Endpoint del Servidor (NPCs)",
    description: "La dirección URL donde corre tu API local compatible para el módulo de NPCs (ej: http://localhost:11434)."
  },
  settingsNpcsModelSelect: {
    title: "Modelo Seleccionado (NPCs)",
    description: "El modelo de lenguaje específico a utilizar para el razonamiento y diálogos interactivos de los agentes NPCs."
  },
  settingsNpcsModelPull: {
    title: "Descargar Modelo para NPCs",
    description: "Descarga modelos autónomos optimizados para diálogos directo a tu PC conectando con la biblioteca de Ollama."
  },

  // === Scripts/Code settings ===
  settingsCodeProvider: {
    title: "Proveedor de Scripts (Código)",
    description: "Elige el motor de IA para la generación y asistencia de código C# para Unity, GDScript para Godot y C++ para Unreal Engine."
  },
  settingsCodeApiKey: {
    title: "API Key de Scripts",
    description: "Clave de acceso opcional para el proveedor de generación de código (vacío para usar la clave global o del sistema)."
  },
  settingsCodeServerToggle: {
    title: "Alternar Local / Cloud (Scripts)",
    description: "Elige si conectarás con una API en la nube del proveedor o a una instancia local de Ollama/LM-Studio para la generación de código."
  },
  settingsCodeServerUrl: {
    title: "Endpoint del Servidor (Scripts)",
    description: "La dirección URL donde corre tu API local compatible para el módulo de Scripts (ej: http://localhost:11434)."
  },
  settingsCodeModelSelect: {
    title: "Modelo Seleccionado (Scripts)",
    description: "El modelo de lenguaje específico a utilizar para la generación y asistencia de código."
  },
  settingsCodeModelPull: {
    title: "Descargar Modelo para Scripts",
    description: "Descarga modelos de código autónomos (como codegemma, qwen:coder, codellama) directo a tu PC usando Ollama."
  },
  codeExportDownloadBtn: {
    title: "Descargar Archivo de Script",
    description: "Guarda el script generado en tu computadora con la extensión y formato seleccionados usando el explorador nativo de archivos."
  },

  // === Dev Portal ===
  devPortalTab: {
    title: "🛠️ Portal Dev / Admin",
    description: "Menú secreto de administración. Activa o desactiva la visibilidad de módulos enteros de la plataforma Omni IA Game."
  },
  devToggleAnimation: {
    title: "Toggle Módulo de Animación",
    description: "Muestra u oculta la pestaña de Animación (video y sprite sheets) en la cabecera y configuraciones de la app."
  },
  devToggleNpcs: {
    title: "Toggle Módulo de NPCs",
    description: "Muestra u oculta la pestaña de Agentes NPCs en la cabecera y configuraciones de la app."
  },
  devToggleThreeD: {
    title: "Toggle Módulo de Suite 3D",
    description: "Muestra u oculta la pestaña del Modelador 3D interactivo en la cabecera y configuraciones de la app."
  },

  // === 3D GEN & Subtabs details ===
  threedMeshDetail: {
    title: "Nivel de Detalle de Malla",
    description: "Alterna la densidad poligonal del modelo: Bajo (móviles/optimizado), Medio (indie/estándar) o Alto (consolas/premium)."
  },
  threedMeshTopology: {
    title: "Topología de Malla 3D",
    description: "Determina si la malla se generará en Triángulos (óptimo para tiempo real) o Quads (óptimo para modeladores y retopolizado)."
  },
  threedRigBiped: {
    title: "Huesos Bípedos",
    description: "Alinea la estructura virtual ósea a un formato de dos extremidades (humanoide) para usar animaciones estándar."
  },
  threedRigSymmetry: {
    title: "Rig Simétrico",
    description: "Habilita la simetría de espejo (Mirror) al calcular la ubicación exacta de las articulaciones de extremidades."
  },
  threedRigFacial: {
    title: "Huesos Faciales / FACS",
    description: "Selecciona el nivel de articulación para ojos, mandíbula y gestos (Basic Facial Rig o FACS de alta fidelidad)."
  },
  threedRigAutoSkeletonBtn: {
    title: "🦴 Auto-Rig Skeleton",
    description: "Dispara el pipeline inteligente local para encajar las articulaciones en la malla 3D y generar el esqueleto."
  },
  threedTexResolution: {
    title: "Resolución de Mapas de Textura",
    description: "Elige la resolución de exportación para los mapas UV de difusión, rugosidad y normales (1K, 2K o 4K px)."
  },
  threedTexPbrToggle: {
    title: "Proyección PBR (Material Físico)",
    description: "Habilita la generación de mapas de relieve, brillo y oclusión ambiental (Normal, Roughness) en lugar de una textura plana."
  },
  threedTexQuality: {
    title: "Calidad de Texturizado",
    description: "Alterna entre renderizado Standard (rápido) y Detailed (análisis estético denso para texturas realistas)."
  },
  threedTexReprocessBtn: {
    title: "🎨 Reprocesar Texturas",
    description: "Dispara la proyección de un nuevo set de mapas de colores y normales sobre la geometría 3D activa."
  },
  threedAnimClipBtn: {
    title: "Clip de Movimiento 3D",
    description: "Selecciona una plantilla de movimiento clásica (Walk, Idle, Running, Victory) para aplicarla al modelo."
  },
  threedAnimApplyBtn: {
    title: "🎬 Aplicar Clip al Rig",
    description: "Combina el rig óseo del modelo con el clip seleccionado para generar y renderizar la secuencia animada en 3D."
  },

  // === NPCs Principal Interface ===
  npcTabChat: {
    title: "Conversación Interactiva",
    description: "Abre el simulador de chat en tiempo real. Permite evaluar afinidad asíncrona de fondo y comprobar la personalidad del NPC."
  },
  npcTabConfig: {
    title: "Configurar Perfil de NPC",
    description: "Ajusta las variables maestras: nombre, rol, atributos psicológicos, system prompt y secreto a revelar."
  },
  npcTabExport: {
    title: "Exportar Script de Juego",
    description: "Autogenera el cerebro lógico cognitivo en código listo para importar a Unity (C#), Godot (GDScript) o Unreal Engine (C++)."
  },
  npcResetHistoryBtn: {
    title: "Reiniciar Historial de Diálogo",
    description: "Vacía el historial de conversación actual y restablece la afinidad emocional al nivel de confianza inicial."
  },
  npcInputName: {
    title: "Nombre del NPC",
    description: "Define el identificador del personaje no jugable en los diálogos y en el código autogenerado."
  },
  npcInputRole: {
    title: "Rol / Oficio del NPC",
    description: "Clase o función del NPC (ej: Netrunner, Mercader, Guardaespaldas) que guiará el contexto de sus respuestas."
  },
  npcInputPersonality: {
    title: "Atributos de Personalidad",
    description: "Adjetivos y rasgos psicológicos (ej: astuto, desconfiado, pragmático) que modulan el tono y modismos del NPC."
  },
  npcInputCodeword: {
    title: "Secreto / Codeword a Revelar",
    description: "La palabra secreta o dato enigmático que el NPC confesará al jugador únicamente cuando su nivel de confianza supere 75."
  },
  npcInputRelationship: {
    title: "Confianza / Relación Inicial",
    description: "Ajusta el nivel de afinidad emocional con el que el NPC comenzará a interactuar contigo (0 a 100)."
  },
  npcInputClues: {
    title: "Pistas y Datos en su Memoria",
    description: "Pistas o fragmentos de información (separados por '|') que el NPC conoce y puede liberar en la conversación."
  },
  npcSystemPromptBtn: {
    title: "✨ Optimizar con Brain IA",
    description: "Usa el Prompt Engineer para refinar y formatear de manera experta las directivas del System Prompt del NPC."
  },
  npcSystemPromptTextarea: {
    title: "Instrucciones de Sistema (System Prompt)",
    description: "Directivas de bajo nivel que mandatan el carácter del NPC y cómo debe reaccionar según el nivel de afinidad."
  },
  npcInputGreetings: {
    title: "Saludos y Frases de Entrada",
    description: "Frases predefinidas (separadas por '|') con las que el NPC puede saludar al jugador al iniciar la simulación."
  },
  npcInputLockout: {
    title: "Condiciones de Expulsión o Bloqueo",
    description: "Temas o insultos (separados por '|') que causarán que el NPC bloquee permanentemente el chat o baje su afinidad a 0."
  },
  npcChatInput: {
    title: "Mensaje para el NPC",
    description: "Escribe tu diálogo o negociación. Recuerda ser empático si deseas ganar la confianza del NPC."
  },
  npcChatSendBtn: {
    title: "Enviar Mensaje",
    description: "Envía el mensaje al cerebro cognitivo de IA del NPC y dispara la evaluación de humor asíncrona."
  },
  npcExportFormatBtn: {
    title: "Formato / Motor de Destino",
    description: "Elige el motor de desarrollo (Unity, Godot, Unreal o JSON puro) para formatear la estructura del script de IA."
  },
  npcExportDownloadBtn: {
    title: "Descargar Script Autogenerado",
    description: "Guarda el script de comportamiento autónomo con el nombre del personaje en el formato y extensión seleccionados."
  },

  // === Classic Animation Extra Buttons ===
  animVolverBtn: {
    title: "Vaciar Panel (Volver)",
    description: "Limpia de forma atómica el visor visual, eliminando keyframes, clips de video y sprite sheets cargados."
  },
  animDownloadPngBtn: {
    title: "Descargar Keyframe Base",
    description: "Descarga el fotograma estático de personaje en formato PNG nítido y a resolución completa."
  },
  animDownloadMp4Btn: {
    title: "Descargar Video HD",
    description: "Descarga la animación de video MP4 fluida autogenerada para integrarla en tu motor de videojuegos."
  },
  animDownloadSpriteBtn: {
    title: "Descargar Sprite Sheet PNG",
    description: "Descarga la hoja de sprites completa en PNG transparente lista para corte 2D."
  },
  animRefinePromptBtn: {
    title: "✨ Refinar Animación con IA",
    description: "Optimiza tu descripción de personaje para generar movimientos y keyframes coherentes."
  },
  animGenerateFullBtn: {
    title: "✨ Generar Animación Completa",
    description: "Crea el keyframe estático inicial y continúa la generación del video y sprite sheet de forma secuencial."
  },
  animGenerateVideoOnlyBtn: {
    title: "🎬 Re-generar Solo Video",
    description: "Actualiza únicamente la animación de video basándote en el keyframe ya generado."
  },

  // === Advanced Animation (5 Pasos) ===
  advAnimType: {
    title: "Acción / Tipo de Animación",
    description: "Selecciona el movimiento o ciclo de acción multi-etapa que el pipeline avanzado generará para tu modelo."
  },
  advAnimStyle: {
    title: "Estilo Visual Avanzado",
    description: "Ajusta la estética del pipeline multi-etapa para que coincida exactamente con tu asset base."
  },
  advAnimConsistency: {
    title: "Atenuación de Consistencia Visual",
    description: "Configura el peso de influencia de la imagen original en la animación final. Un peso equilibrado asegura rotaciones coherentes."
  },
  advAnimSketchBtn: {
    title: "Cargar Boceto / Pose de Referencia",
    description: "Carga una imagen local de pose en T o referencia anatómica para guiar la estructura esquelética del modelo."
  },
  advAnimRefineBtn: {
    title: "✨ Refinar con Brain IA",
    description: "Usa el Prompt Engineer avanzado para optimizar los prompts de la secuencia de 5 pasos en ComfyUI local."
  },
  advAnimPositive: {
    title: "Prompt de Movimiento (Positivo)",
    description: "Describe detalladamente la acción tridimensional o física del ciclo a animar."
  },
  advAnimNegative: {
    title: "Prompt Negativo de Movimiento",
    description: "Veta artefactos visuales, distorsiones de extremidades o pérdida de ropa durante la animación."
  },
  advAnimGenerate: {
    title: "Generar Secuencia 5 Pasos",
    description: "Dispara el pipeline secuencial avanzado para renderizar fotogramas intermedios estables y coser la secuencia."
  },
  advAnimReset: {
    title: "Restablecer Pipeline Avanzado",
    description: "Limpia el buffer de la animación avanzada y reinicia el pipeline de 5 pasos a su estado inicial."
  },
  advAnimDefringe: {
    title: "Eliminación de Halos (Rust)",
    description: "Ejecuta el procesamiento de defringing nativo en Rust para remover imperfecciones y bordes del fondo croma."
  },

  // === AssetGenerator (Mundos / Escenarios) ===
  assetProceduralCheck: {
    title: "Mundo Procedural Wang",
    description: "Habilita la generación de escenarios basados en plantillas de baldosas procedurales y patrones Wang coherentes."
  },
  assetPerspectiveSelect: {
    title: "Perspectiva de Juego",
    description: "Selecciona el ángulo de proyección del escenario (Isométrica, Lateral 2D, Top-Down o Panorámica 360)."
  },
  assetTileDensitySelect: {
    title: "Densidad de la Baldosa (Grid)",
    description: "Determina el tamaño del mapa de tilesets o grid de colisiones del escenario generado (16x16, 32x32, 64x64)."
  },
  assetEmptySceneCheck: {
    title: "Generar Escenario Vacío (Tile Base)",
    description: "Si está activo, la IA omitirá objetos decorativos pesados, devolviendo una textura base limpia lista para mapear."
  },
  settingsImageComfyDeployApiKey: {
    title: "API Key de ComfyDeploy (Imagen)",
    description: "Clave de acceso de la API de ComfyDeploy para la generación en la nube de imágenes/sprites."
  },
  settingsImageComfyDeployDeploymentId: {
    title: "Deployment ID de ComfyDeploy (Imagen)",
    description: "El ID de despliegue asignado en ComfyDeploy para tu workflow de imágenes."
  },
  settingsImageCustomWorkflow: {
    title: "Workflow ComfyUI Custom (Imagen)",
    description: "Carga tu propio archivo JSON de workflow para procesar la síntesis de sprites y personajes."
  },
  settingsVideoComfyDeployApiKey: {
    title: "API Key de ComfyDeploy (Video)",
    description: "Clave de acceso de la API de ComfyDeploy para la generación de video en la nube."
  },
  settingsVideoComfyDeployDeploymentId: {
    title: "Deployment ID de ComfyDeploy (Video)",
    description: "El ID de despliegue asignado en ComfyDeploy para tu workflow de video (SVD/AnimateDiff)."
  },
  settingsVideoServerUrl: {
    title: "Servidor de Video Local",
    description: "Dirección URL del servidor local de ComfyUI para video (ej. http://127.0.0.1:8188)."
  },
  settingsVideoModel: {
    title: "Modelo de Video",
    description: "Nombre del checkpoint o modelo de video a cargar en tu motor local/nube (ej. svd.safetensors)."
  },
  settingsVideoPipeline: {
    title: "Pipeline de Video",
    description: "Selecciona el pipeline técnico para el procesado de video (SVD, AnimateDiff, Luma, etc.)."
  },
  settingsTtsComfyDeployApiKey: {
    title: "API Key de ComfyDeploy (Voz)",
    description: "Clave de acceso de la API de ComfyDeploy para síntesis de voz en la nube."
  },
  settingsTtsComfyDeployDeploymentId: {
    title: "Deployment ID de ComfyDeploy (Voz)",
    description: "El ID de despliegue asignado en ComfyDeploy para tu workflow de voz."
  },
  settingsAudioTtsEdgeControl: {
    title: "Controlador Local de Edge TTS",
    description: "Ajusta la comunicación directa con el microservicio local de Edge TTS."
  },
  settingsMusicComfyDeployApiKey: {
    title: "API Key de ComfyDeploy (Música)",
    description: "Clave de acceso de la API de ComfyDeploy para componer melodías en la nube."
  },
  settingsMusicComfyDeployDeploymentId: {
    title: "Deployment ID de ComfyDeploy (Música)",
    description: "El ID de despliegue de ComfyDeploy para tu workflow de composición musical."
  },
  settingsSfxComfyDeployApiKey: {
    title: "API Key de ComfyDeploy (SFX)",
    description: "Clave de acceso de la API de ComfyDeploy para sintetizar efectos de sonido en la nube."
  },
  settingsSfxComfyDeployDeploymentId: {
    title: "Deployment ID de ComfyDeploy (SFX)",
    description: "El ID de despliegue de ComfyDeploy para tu workflow de efectos de sonido."
  },
  settingsThreeDCDApiKey: {
    title: "API Key de ComfyDeploy (3D)",
    description: "Clave de acceso de la API de ComfyDeploy para generar mallas poligonales 3D en la nube."
  },
  settingsThreeDCDDeploymentId: {
    title: "Deployment ID de ComfyDeploy (3D)",
    description: "El ID de despliegue de ComfyDeploy para tu workflow de generación de mallas y texturas 3D."
  },
  settingsThreeDBaseUrl: {
    title: "Servidor de 3D Local",
    description: "Dirección URL base del servidor local ComfyUI para modelado 3D (ej. http://127.0.0.1:8188)."
  },

  settingsSaveBtn: {
    title: "Guardar y Probar Conexión",
    description: "Almacena los ajustes de configuración de APIs e intenta conectar a los servidores locales activos para verificar el estado."
  },

  // ===========================================================================
  //  Claves que la interfaz pedía y no existían
  // ---------------------------------------------------------------------------
  //  `Tooltip` devuelve el control sin envolver cuando no encuentra su clave
  //  (Tooltip.tsx:95), asi que 22 controles llevaban tiempo sin ayuda y sin dar
  //  ningun error. Estas son esas 22.
  // ===========================================================================

  settingsImageModelSelect: {
    title: "Modelo de Imagen",
    description: "Modelo concreto que usará el proveedor elegido para generar sprites y escenarios. La lista cambia según el proveedor."
  },
  settingsTextModelSelect: {
    title: "Modelo de Texto",
    description: "Modelo que redacta guiones, refina prompts y responde en el asistente. Un modelo mayor da mejor prosa pero tarda más."
  },
  settingsVideoModelSelect: {
    title: "Modelo de Vídeo",
    description: "Modelo que convierte imágenes fijas en movimiento. Los de vídeo consumen mucha más memoria de GPU que los de imagen."
  },
  settingsNpcModelSelect: {
    title: "Modelo de Diálogo de NPC",
    description: "Modelo que interpreta a los personajes no jugables. Conviene uno con buena coherencia de carácter a lo largo de una conversación."
  },
  settingsNpcsOtherModel: {
    title: "Modelo Personalizado de NPC",
    description: "Nombre exacto del modelo cuando usas un proveedor que no está en la lista. Debe coincidir con el identificador que espera ese servidor."
  },
  settingsAudioTtsModelSelect: {
    title: "Modelo de Voz (TTS)",
    description: "Motor que convierte el guion en locución. Cada uno tiene sus propias voces y su propio idioma nativo."
  },
  settingsAudioTtsWorkflowId: {
    title: "Workflow de Voz en ComfyUI",
    description: "Identificador del workflow que sintetiza la voz. Debe existir en el ComfyUI conectado y aceptar el texto como entrada."
  },
  settingsAudioMusicModelSelect: {
    title: "Modelo de Música Local",
    description: "Motor que compone las pistas musicales en tu equipo. Las duraciones largas multiplican el tiempo de proceso."
  },
  settingsAudioMusicModelSelectCloud: {
    title: "Modelo de Música en la Nube",
    description: "Servicio remoto que compone la música. Requiere clave de API y consume crédito de tu cuenta en cada generación."
  },
  settingsAudioMusicGeminiApiKey: {
    title: "Clave de API para Música",
    description: "Credencial del servicio de música en la nube. Se guarda solo en tu equipo y nunca se incluye en los proyectos exportados."
  },
  settingsAudioMusicUrlComfyUI: {
    title: "Servidor de Música",
    description: "Dirección del ComfyUI que genera música. Puede ser distinto del de imágenes si prefieres repartir la carga en dos equipos."
  },
  settingsAudioMusicWorkflowComfyUI: {
    title: "Workflow de Música (.json)",
    description: "Sube el workflow que compone la música. Debe estar exportado en formato API para que ComfyUI pueda ejecutarlo."
  },
  settingsAudioMusicWorkflowIdComfyUI: {
    title: "Workflow de Música por Nombre",
    description: "Identificador de un workflow de música que ya está guardado en el servidor, como alternativa a subir el fichero."
  },
  settingsAudioSfxModelSelect: {
    title: "Modelo de Efectos Locales",
    description: "Motor que sintetiza los efectos de sonido en tu equipo. Los efectos cortos son mucho más rápidos que la música."
  },
  settingsAudioSfxModelSelectCloud: {
    title: "Modelo de Efectos en la Nube",
    description: "Servicio remoto que genera los efectos de sonido. Requiere clave de API y consume crédito en cada generación."
  },
  settingsAudioSfxUrlComfyUI: {
    title: "Servidor de Efectos",
    description: "Dirección del ComfyUI que genera los efectos de sonido. Puede ser el mismo que el de imágenes o uno distinto."
  },
  settingsAudioSfxWorkflowComfyUI: {
    title: "Workflow de Efectos (.json)",
    description: "Sube el workflow que sintetiza los efectos. Debe estar exportado en formato API para que ComfyUI pueda ejecutarlo."
  },
  settingsAudioSfxWorkflowIdComfyUI: {
    title: "Workflow de Efectos por Nombre",
    description: "Identificador de un workflow de efectos ya guardado en el servidor, como alternativa a subir el fichero."
  },
  comfyuiPathSelector: {
    title: "Carpeta de ComfyUI",
    description: "Ruta donde está instalado ComfyUI. Se usa para arrancarlo, pararlo y leer su registro sin salir de la aplicación."
  },
  audioClearBtn: {
    title: "Limpiar Audio",
    description: "Descarta la pista generada y vacía el formulario. No borra los audios que ya hayas guardado en el proyecto."
  },
  narrativeClearBtn: {
    title: "Limpiar Guion",
    description: "Vacía el texto y las pistas de audio de la escena actual para empezar de cero. No afecta a las escenas ya guardadas."
  },

  // ===========================================================================
  //  Selección de workflows por acción y por perspectiva
  // ===========================================================================

  workflowByAction: {
    title: "Workflow por Acción",
    description: "Asigna un workflow distinto a cada acción. Sirve para quedarte con el modelo que mejor resuelve cada una: el que borda un Idle puede fallar en un Attack."
  },
  workflowByPerspective: {
    title: "Workflow por Perspectiva",
    description: "Asigna un workflow a cada perspectiva de juego. Es lo que de verdad cambia el tipo de escenario, más que el estilo artístico."
  },
  workflowSlotSelect: {
    title: "Workflow de esta Acción",
    description: "Elige de la lista con qué workflow se genera. Vacío usa el general de Ajustes. La lista sale de la carpeta public/workflows."
  },
  workflowSlotUpload: {
    title: "Subir Workflow",
    description: "Carga un .json en formato API y lo asigna a esta fila. Queda disponible en todas las demás listas sin volver a subirlo."
  },
  workflowSlotClear: {
    title: "Borrar Asignación de Workflow",
    description: "Borra la asignación personalizada para esta acción o perspectiva y restaura el control al workflow general por defecto."
  },
  workflowActiveSelect: {
    title: "Workflow a Usar",
    description: "Workflow con el que se generará, según la acción o la perspectiva elegida. Lo que cambies aquí queda guardado y se ve en Ajustes."
  },
  workflowAdoptFromAsset: {
    title: "Adoptar este Workflow",
    description: "Asigna a esta acción el workflow que produjo la imagen. La aplicación no juzga cuál salió mejor: eso lo decides tú al verla."
  },
  sheetStrategyHint: {
    title: "Cómo se Hará la Hoja",
    description: "Si el workflow trae un LoRA de giro, las vistas salen en una sola generación. Si no, se generan por separado y puede que salgan iguales: el giro lo aporta el LoRA, no el prompt."
  },

  // ===========================================================================
  //  Semilla, LoRA, tamaño y recorte de fondo
  // ===========================================================================

  seedMode: {
    title: "Semilla",
    description: "Con la semilla fija, el mismo prompt da la misma imagen: es la única forma de comparar dos modelos en igualdad de condiciones."
  },
  seedValue: {
    title: "Valor de la Semilla",
    description: "Número que determina el ruido inicial. Reutiliza el de una imagen que te gustó para variarla sin perder su composición."
  },
  seedReuseLast: {
    title: "Reutilizar la Última",
    description: "Fija la semilla que produjo la última imagen generada, para poder repetirla cambiando solo el prompt o el modelo."
  },
  seedRelease: {
    title: "Soltar la Semilla",
    description: "Vuelve a sortear una semilla en cada generación. Es lo normal cuando buscas variedad en vez de comparar."
  },
  loraTrigger: {
    title: "Palabra de Activación del LoRA",
    description: "Se escribe literalmente al principio del prompt, sin traducir ni modificar. Muchos LoRAs solo actúan si su palabra aparece tal cual."
  },
  loraOwnsStyle: {
    title: "El LoRA Manda en el Estilo",
    description: "Retira las indicaciones de estilo del prompt para que no compitan con el LoRA. Úsalo cuando el LoRA ya define el aspecto por sí solo."
  },
  spriteResolution: {
    title: "Resolución del Sprite",
    description: "Lado en píxeles de la imagen. Más resolución da más detalle, pero pasarse del tamaño con el que se entrenó el modelo produce duplicaciones."
  },
  spriteAspect: {
    title: "Proporción",
    description: "Forma de la imagen. Se reparte el mismo presupuesto de píxeles, así que cambiar la proporción cambia la forma pero no el detalle."
  },
  removeBgInWorkflow: {
    title: "Recortar el Fondo en el Workflow",
    description: "Inserta un nodo de recorte en el grafo para que la imagen llegue ya sin fondo, en vez de recortarla después en la aplicación."
  },
  rembgModel: {
    title: "Modelo de Recorte",
    description: "Red que separa la figura del fondo. Los orientados a dibujo respetan mejor los contornos limpios que los pensados para foto."
  },
  generationMetaSummary: {
    title: "Con qué se Generó",
    description: "Modelo, LoRAs, semilla y tamaño reales de esta imagen, leídos del grafo enviado. Sin esto, una imagen buena no se puede reproducir."
  },
  worldDensity: {
    title: "Composición del Escenario",
    description: "Qué tipo de escena se construye: campo abierto, aldea, mazmorra, cueva o pasillo de runner. Filtra qué elementos son coherentes y cómo se reparten."
  },
  worldResolution: {
    title: "Resolución del Mundo",
    description: "Lado en píxeles del escenario. Cuanto mayor, más detalle al acercarse, pero pasarse del tamaño de entrenamiento del modelo duplica horizontes y elementos."
  },
  worldAspect: {
    title: "Proporción del Mundo",
    description: "Forma del escenario. Se reparte el mismo presupuesto de píxeles, así que un panorámico es más ancho pero no más detallado. Vertical encaja con los runners."
  },
  assetReferenceImage: {
    title: "Imagen de Referencia",
    description: "Sube un boceto o un asset ya hecho para que el nuevo mantenga su dirección artística. Es lo que da consistencia visual entre piezas de un mismo juego."
  },
  copySeed: {
    title: "Copiar la Semilla",
    description: "Copia la semilla al portapapeles para reutilizarla y comparar el mismo encuadre con otro modelo o otro LoRA."
  },

  // ===========================================================================
  //  CREADOR DE MUNDOS 2D / 2.5D
  // ---------------------------------------------------------------------------
  //  Mismo mapa que el resto de la aplicacion a proposito: el modulo reusa el
  //  componente `Tooltip`, asi que las ayudas son identicas en aspecto y
  //  comportamiento. Ver `modules/creador2d/components/Help.tsx`.
  // ===========================================================================

  c2dHelpToggle: {
    title: "Ayudas Flotantes",
    description: "Muestra u oculta las explicaciones al pasar el ratón por cada herramienta del editor. Equivale al botón Ayudas de la barra superior."
  },

  // --- Herramientas -----------------------------------------------------------
  c2dToolPlace: {
    title: "Colocar Bloque",
    description: "Pinta el bloque seleccionado en la celda bajo el cursor. Se ajusta solo a la rejilla, así que no hace falta apuntar con precisión.",
    shortcut: "B"
  },
  c2dToolBreak: {
    title: "Romper Bloque",
    description: "Borra el contenido de la celda en la capa activa. Solo afecta a la capa que tengas seleccionada, no a las de debajo.",
    shortcut: "E"
  },
  c2dToolRect: {
    title: "Rectángulo",
    description: "Arrastra para rellenar un área entera de una vez. Mucho más rápido que celda a celda para suelos y muros largos.",
    shortcut: "R"
  },
  c2dToolPick: {
    title: "Cuentagotas",
    description: "Toma el bloque que hay bajo el cursor y lo deja seleccionado, para seguir pintando con él sin buscarlo en la paleta.",
    shortcut: "I"
  },
  c2dToolObject: {
    title: "Mobiliario Libre",
    description: "Coloca objetos en la posición exacta del cursor, sin ajustar a la rejilla. No participan en las colisiones: una silla adorna, no bloquea. Clic derecho retira.",
    shortcut: "O"
  },
  c2dToolPan: {
    title: "Mover la Vista",
    description: "Arrastra el lienzo para desplazarte por el mundo sin modificar nada.",
    shortcut: "Espacio"
  },
  c2dUndo: {
    title: "Deshacer",
    description: "Revierte la última edición. El historial es por sesión y no se guarda al cerrar el mundo.",
    shortcut: "Ctrl+Z"
  },
  c2dRedo: {
    title: "Rehacer",
    description: "Vuelve a aplicar la edición que acabas de deshacer.",
    shortcut: "Ctrl+Y"
  },
  c2dZoomIn: {
    title: "Acercar",
    description: "Aumenta el zoom sobre el centro de la vista. La rueda del ratón hace lo mismo, salvo encima de un objeto libre, donde lo redimensiona."
  },
  c2dZoomOut: {
    title: "Alejar",
    description: "Reduce el zoom para ver más mundo de una vez. A zoom muy bajo se dibuja el contorno de la región editable."
  },
  c2dFrameChunk: {
    title: "Encuadrar Chunk",
    description: "Ajusta la cámara al chunk donde estás. Útil para trabajar una zona concreta sin perder de vista sus límites."
  },
  c2dFrameWorld: {
    title: "Encuadrar Mundo",
    description: "Aleja la cámara hasta ver el mundo completo, para comprobar la composición general."
  },
  c2dClearWorld: {
    title: "Vaciar el Mundo",
    description: "Borra TODOS los bloques del mundo. No se puede deshacer con Ctrl+Z y avisa antes de hacerlo."
  },
  c2dToggleGrid: {
    title: "Ver la Rejilla",
    description: "Muestra u oculta las líneas de la rejilla. Ocultarla ayuda a juzgar el resultado final; mostrarla, a alinear piezas."
  },
  c2dToggleSnapGrid: {
    title: "Imán de Cuadrícula",
    description: "Alinea los objetos libres y mobiliario a la rejilla de 32x32px al colocarlos o arrastrarlos."
  },
  c2dToggleChunkBorders: {
    title: "Ver Límites de Chunk",
    description: "Dibuja el contorno de cada chunk. El mundo se carga por chunks, así que estos límites explican dónde puedes editar."
  },
  c2dToggleCollision: {
    title: "Ver Colisiones",
    description: "Superpone la matriz de colisiones que se exportará al motor. Es una capa lógica distinta de la visual: sirve para ver por dónde podrá caminar el jugador."
  },
  c2dDimInactiveLayers: {
    title: "Atenuar Otras Capas",
    description: "Baja la opacidad de las capas que no estás editando, para distinguir en qué capa estás trabajando."
  },
  c2dStrictResidency: {
    title: "Residencia Estricta 3×3",
    description: "Limita la carga a los 9 chunks vecinos en vez de adaptarla al zoom. Útil para reproducir el comportamiento del motor en el juego real."
  },

  // --- Paleta y capas ---------------------------------------------------------
  c2dBlockSearch: {
    title: "Buscar Bloque",
    description: "Filtra el catálogo por nombre. Con cientos de bloques es más rápido escribir «puerta» que recorrer la lista."
  },
  c2dBlockCategory: {
    title: "Categoría de Bloques",
    description: "Agrupa el catálogo por familia: suelos, muros, agua, vegetación, mobiliario, calles, obstáculos y coleccionables."
  },
  c2dBlockSwatch: {
    title: "Bloque del Catálogo",
    description: "Selecciónalo para pintar con él. Los bloques de mobiliario solo se colocan con la herramienta de objetos libres."
  },
  c2dLayerSelect: {
    title: "Capa Activa",
    description: "Capa sobre la que se pinta y se borra. El orden 2.5D se calcula por el borde inferior de cada pieza, no por la capa."
  },
  c2dLayerVisibility: {
    title: "Visibilidad de la Capa",
    description: "Oculta la capa sin borrar su contenido. Sirve para ver qué hay debajo mientras editas."
  },

  // --- Geometría, clima y fluidos --------------------------------------------
  c2dGridAngle: {
    title: "Inclinación del Plano",
    description: "Gira el plano del mundo entre -45° y +45°, porque un exterior visto desde arriba no es totalmente plano. El imán sigue siendo exacto: el cursor se desgira antes de convertirse en celda."
  },
  c2dTileSize: {
    title: "Tamaño de Baldosa",
    description: "Píxeles de lado de cada celda. Define la métrica del mundo y debe coincidir con la que espere tu motor."
  },
  c2dPerspective: {
    title: "Perspectiva del Mundo",
    description: "Determina cómo se dibuja y cómo se exporta: lateral, cenital, isométrica o pasillo de runner. Los interiores heredan la del exterior."
  },
  c2dBiome: {
    title: "Bioma",
    description: "Filtra la paleta de colores a la del entorno elegido, entre 16 biomas. Afecta también a los fondos generados por IA."
  },
  c2dWeatherType: {
    title: "Efecto de Clima",
    description: "Lluvia, nieve, polvo, niebla, ascuas o neblina, cada uno con su propia física de caída. «Despejado» lo apaga."
  },
  c2dWeatherIntensity: {
    title: "Intensidad",
    description: "Densidad de partículas del efecto. Los valores altos repintan el lienzo en cada fotograma y cargan más la vista previa."
  },
  c2dWeatherLightning: {
    title: "Relámpagos",
    description: "Añade destellos a pantalla completa, combinables con cualquier efecto. La cadencia es una media con margen aleatorio, porque un intervalo exacto se percibe como parpadeo mecánico."
  },
  c2dWindRose: {
    title: "Dirección del Viento",
    description: "Hacia dónde arrastra el clima. Se incrusta en los scripts que se generan para Unity, Godot y Unreal."
  },
  c2dWindStrength: {
    title: "Fuerza del Viento",
    description: "Cuánto desvía las partículas de su caída vertical. En la lluvia el bamboleo lateral es cero; en el polvo llega a 40 px."
  },
  c2dFogDensity: {
    title: "Densidad de Niebla",
    description: "Opacidad del velo atmosférico. Se dibuja más denso en la parte baja, como ocurre de verdad."
  },
  c2dFluidSelect: {
    title: "Fluido a Configurar",
    description: "Solo aparecen los fluidos realmente colocados en el mundo: no tiene sentido configurar la corriente de un agua que no existe."
  },
  c2dFluidFlow: {
    title: "Sentido de la Corriente",
    description: "Dirección en la que se mueve el fluido. Se traduce a los ejes de cada motor al exportar."
  },
  c2dFluidSpeed: {
    title: "Velocidad de la Corriente",
    description: "Rapidez del desplazamiento del fluido. Afecta a la vista previa y al script exportado."
  },
  c2dFluidBubbles: {
    title: "Burbujas",
    description: "Añade partículas ascendentes al fluido. Ayuda a distinguir el agua profunda de un charco."
  },

  // --- Parallax y fondos por IA ----------------------------------------------
  c2dParallaxLayer: {
    title: "Capa de Parallax",
    description: "Cielo, lejano, medio o cercano. Cada una se desplaza a distinta velocidad para dar sensación de profundidad."
  },
  c2dParallaxFactor: {
    title: "Factor de Desplazamiento",
    description: "Cuánto se mueve la capa respecto a la cámara. Valores bajos parecen más lejanos; 1 se mueve igual que el suelo."
  },
  c2dParallaxGenerate: {
    title: "Generar Fondo con IA",
    description: "Crea la capa con el ComfyUI local, con un prompt diseñado para repetirse en horizontal sin costura y para leerse a su distancia."
  },
  c2dParallaxPreviewPrompt: {
    title: "Ver el Prompt",
    description: "Muestra el prompt que se enviaría, sin gastar GPU. Útil para entender qué se le pide al modelo antes de generar."
  },
  c2dParallaxUpload: {
    title: "Subir Imagen de Fondo",
    description: "Usa una imagen propia como capa. Se le aplica un solape mezclado para que el tileado horizontal no muestre la costura."
  },

  // --- Objetos, interiores y runner ------------------------------------------
  c2dObjectScale: {
    title: "Tamaño del Objeto",
    description: "Escala la pieza entre 0,1× y 8×. La rueda del ratón encima de un objeto hace lo mismo sin abrir el panel."
  },
  c2dInteriorCreate: {
    title: "Crear Interior",
    description: "Un interior ES un mundo enlazado a la celda de su puerta: se edita con las mismas herramientas y hereda perspectiva y métrica del exterior."
  },
  c2dInteriorEnter: {
    title: "Entrar al Interior",
    description: "Abre el mundo enlazado a esta entrada. No se permiten interiores anidados ni dos interiores en la misma puerta."
  },
  c2dRunnerLanes: {
    title: "Número de Carriles",
    description: "Carriles discretos del pasillo. En los runners el personaje corre centrado y el escenario viene hacia él, de ahí que el mundo sea una tira vertical."
  },
  c2dRunnerLaneWidth: {
    title: "Ancho de Carril",
    description: "Celdas que ocupa cada carril. Determina cuánto se desplaza el personaje al cambiar de carril."
  },

  // --- Mundos, exportación y cuenta -----------------------------------------
  c2dWorldNew: {
    title: "Nuevo Mundo",
    description: "Crea un mundo con su perspectiva, bioma y métrica. Estos ajustes definen cómo se dibuja y cómo se exporta."
  },
  c2dWorldName: {
    title: "Nombre del Mundo",
    description: "Nombre identificador para tu mapa o escenario (ej. Valle del Este). Se usará al guardar y al exportar."
  },
  c2dWorldType: {
    title: "Tipo / Vista del Mundo",
    description: "Selecciona entre Vista Lateral 2D (plataformas), Top-Down (visión cenital) o Isométrico 2.5D."
  },
  c2dTypeCenital: {
    title: "Cenital pura (90°)",
    description: "Cámara totalmente perpendicular al suelo vista desde arriba. Ideal para juegos tácticos o de estrategia."
  },
  c2dTypeRPG: {
    title: "Cenital 3/4 (RPG)",
    description: "Perspectiva clásica de RPG. Activa ordenación por profundidad Y-sort automática."
  },
  c2dTypeRunner: {
    title: "Countryside (Runner lateral)",
    description: "Vista de desplazamiento horizontal continuo con capas de parallax infinito en el fondo."
  },
  c2dTypePlatformer: {
    title: "Plataformas laterales",
    description: "Vista lateral 2D tradicional con física de gravedad, plataformas atravesables y escaleras."
  },
  c2dChunkSize: {
    title: "Dimensiones de Chunk",
    description: "Cantidad de celdas por cuadrícula de carga (16x16 o 32x32 tiles por sección de mapa)."
  },
  c2dBackground: {
    title: "Color de Fondo Base",
    description: "Color hexadecimal de fondo detrás de las capas de escenario cuando no hay imagen de parallax."
  },
  c2dWorldDescription: {
    title: "Descripción del Escenario",
    description: "Resumen o contexto opcional del mapa para organización de tu proyecto."
  },
  c2dNewWorldHeader: {
    title: "Creación de Nuevo Mundo",
    description: "Define la configuración inicial de tu escenario. Al crearlo podrás pintar bloques con la cuadrícula magnética."
  },
  c2dWorldOpen: {
    title: "Abrir Mundo",
    description: "Carga el mundo en el editor. Los chunks se traen según te desplazas, no todos de golpe."
  },
  c2dWorldDelete: {
    title: "Borrar Mundo",
    description: "Elimina el mundo y todos sus chunks de la base de datos. No se puede deshacer."
  },
  c2dExportEngine: {
    title: "Motor de Destino",
    description: "Unity, Godot o Unreal. Cambia el formato, la conversión de ejes y los scripts de clima y fluidos que se generan."
  },
  c2dExportDownload: {
    title: "Exportar",
    description: "Descarga el mundo con sus capas, colisiones, parallax, objetos, clima, fluidos e interiores, más el código de runtime del motor elegido."
  },
  scriptEngineUnity: {
    title: "Exportar para Unity (.cs)",
    description: "Genera la clase C# lista para importar en el motor Unity."
  },
  scriptEngineGodot: {
    title: "Exportar para Godot (.gd)",
    description: "Genera el script GDScript compatible con nodos de Godot Engine."
  },
  scriptEngineUnreal: {
    title: "Exportar para Unreal (.cpp)",
    description: "Genera el código C++ heredando de AActor o UActorComponent para Unreal Engine."
  },
  scriptEngineJson: {
    title: "Exportar como JSON (.json)",
    description: "Genera una estructura de datos JSON estandarizada para parsing y consumo por runtime."
  },
  c2dEngineToken: {
    title: "Token para el Motor",
    description: "Credencial que usan los plugins de Unity, Godot y Unreal para leer tus mundos. Trátalo como una contraseña."
  },
  c2dLoginEmail: {
    title: "Correo",
    description: "Correo de tu cuenta del Creador 2D. Es independiente de las claves de API de la aplicación."
  },
  c2dLoginPassword: {
    title: "Contraseña",
    description: "Se guarda cifrada con Argon2id. La sesión usa tokens que rotan, con detección de reutilización."
  },
  c2dLoginSubmit: {
    title: "Entrar",
    description: "Inicia sesión en el backend del Creador 2D, que corre aparte y no interfiere con ComfyUI ni con Ollama."
  },
  c2dAiToggle: {
    title: "Sugerencias de IA",
    description: "Está desactivada de fábrica. La IA nunca escribe en la base de datos: propone, se valida contra el catálogo y un área autorizada, y solo tú las aplicas."
  },
  c2dAiAccept: {
    title: "Aceptar Sugerencia",
    description: "Aplica la propuesta de la IA al mundo. Hasta que pulsas, nada se ha modificado."
  },

  // --- NUEVOS TOOLTIPS AUDITADOS (v0.2.0) ---
  spriteBgWhite: {
    title: "Fondo Blanco",
    description: "Genera la imagen con un fondo blanco puro de alto contraste, ideal para posterior recorte manual."
  },
  spriteBgChroma: {
    title: "Fondo Verde Chroma",
    description: "Genera un fondo verde brillante (#00FF00) para extracción mediante clave croma sin pérdida de bordes."
  },
  spriteBgTransparent: {
    title: "Fondo Transparente",
    description: "Aplica remoción de fondo automática por IA (Rembg) generando directamente un archivo PNG con canal alfa."
  },
  worldRemoveBg: {
    title: "Quitar Fondo al Generar Escenario",
    description: "Aplica la remoción automática del fondo del escenario generado dejando solo las capas y estructuras del mapa."
  },
  assetWorldRemoveBg: {
    title: "Quitar Fondo al Generar Escenario",
    description: "Aplica la remoción automática del fondo del escenario generado dejando solo las capas y estructuras del mapa."
  },
  openWorldGenerator: {
    title: "Generador IA de Escenarios",
    description: "Genera fondos y mapas 2D/2.5D completos a partir de descripciones de texto o imágenes semilla mediante IA."
  },
  openCreador2D: {
    title: "Creador de Mundos 2D / 2.5D",
    description: "Abre el editor de escenarios por bloques 2D/2.5D con cuadrícula magnética, capas de profundidad y exportación a Unity, Godot y Unreal."
  },
  worldBrowserNewBtn: {
    title: "Crear Nuevo Mundo",
    description: "Inicializa un mapa con el bioma, tamaño de tile y dimensiones de chunk seleccionadas."
  },
  animRandomSeed: {
    title: "Semilla Aleatoria de Animación",
    description: "Indica si cada fotograma o ciclo de animación se genera con un punto inicial de aleatoriedad distinto."
  },
  animCustomSeed: {
    title: "Semilla Fija de Animación",
    description: "Establece un número de semilla fijo para mantener la consistencia visual exacta entre generaciones."
  },
  narrativeRefineAi: {
    title: "Refinar con IA (Prompt Engineer)",
    description: "Pule y enriquece la idea narrativa seleccionada usando el modelo Prompt Engineer configurado."
  },
  narrativeRandomSeed: {
    title: "Semilla Aleatoria Narrativa",
    description: "Permite variaciones creativas libres en la generación de diálogos y guiones."
  },
  narrativeCustomSeed: {
    title: "Semilla Fija Narrativa",
    description: "Fija el valor aleatorio para reproducir exactamente la misma estructura de guion."
  },
  npcNewBtn: {
    title: "Nuevo Perfil NPC",
    description: "Crea una ficha vacía para configurar un personaje no jugable con personalidad y métricas de afinidad."
  },
  npcAffinityMetrics: {
    title: "Métricas de Afinidad",
    description: "Muestra el nivel de confianza y relación acumulada del NPC respecto a las decisiones del jugador (0 a 100)."
  },
  npcMoodEvaluator: {
    title: "Evaluador de Humor",
    description: "Sistema asíncrono por IA que analiza el tono emocional y el impacto del diálogo en el humor del NPC."
  },
  scriptClassName: {
    title: "Nombre de Clase / Script",
    description: "Define el identificador PascalCase para la clase o script que se exportará (ej. GameLogic)."
  },
  scriptEngineSelector: {
    title: "Selección del Motor de Destino",
    description: "Selecciona Unity (.cs), Godot (.gd), Unreal Engine (.cpp) o JSON puro para adaptar el formato exportado."
  },
  scriptCopyBtn: {
    title: "Copiar Código al Portapapeles",
    description: "Copia el script de integración completo generado directamente en tu portapapeles."
  },
  audioSfxRandomSeed: {
    title: "Semilla Aleatoria SFX",
    description: "Indica si cada efecto de sonido se sintetiza a partir de una semilla aleatoria."
  },
  audioSfxCustomSeed: {
    title: "Semilla Fija SFX",
    description: "Fija la semilla del motor de sintetización de audio SFX para conservar el mismo timbre."
  },
  audioMusicRandomSeed: {
    title: "Semilla Aleatoria Música",
    description: "Indica si la pista musical generada varía su punto inicial de aleatoriedad."
  },
  audioMusicCustomSeed: {
    title: "Semilla Fija Música",
    description: "Fija la semilla del motor de música para conservar el leitmotiv o melodía base."
  },
  audioUseRandomSeed: {
    title: "Semilla Aleatoria de Audio",
    description: "Indica si cada efecto de sonido o pista musical se genera a partir de una semilla aleatoria."
  },
  audioCustomSeed: {
    title: "Semilla Fija de Audio",
    description: "Establece una semilla fija para conservar el timbre del efecto de sonido o melodía."
  },
  threeDRandomSeed: {
    title: "Semilla Aleatoria 3D",
    description: "Indica si la generación o texturizado del modelo 3D usa semillas aleatorias."
  },
  threeDCustomSeed: {
    title: "Semilla Fija 3D",
    description: "Fija la semilla numérica para conservar la misma topología y mapa de texturas 3D."
  },
  spriteBasicBackgrounds: {
    title: "Toggle de Fondos Básicos vs Personalizados",
    description: "Activo: Habilita los botones de estudio (Blanco, Chroma o Sin Fondo). Desactivado: La IA respetará y expandirá el entorno, paisaje y suelo que describas en tus detalles."
  },
  settingsLlamaGpuLayers: {
    title: "Capas en GPU (-ngl)",
    description: "Número de capas del modelo GGUF a cargar en la VRAM de la GPU. 999 carga el modelo completo en la tarjeta gráfica para máxima velocidad."
  },
  settingsLlamaContext: {
    title: "Ventana de Contexto (-c)",
    description: "Cantidad máxima de tokens de memoria que el servidor reserva para procesar prompts largos y guiones extensos."
  },
  settingsLlamaThreads: {
    title: "Hilos de Procesamiento CPU (-t)",
    description: "Número de subprocesos lógicos de la CPU asignados a la inferencia del modelo cuando no corre al 100% en GPU."
  },
  settingsLlamaPort: {
    title: "Puerto del Servidor llama-server",
    description: "Puerto TCP local donde llama-server expone su API compatible con OpenAI (por defecto 8088)."
  },
  settingsLlamaCustomArgs: {
    title: "Argumentos CLI Personalizados",
    description: "Parámetros de línea de comandos avanzados para el binario llama-server (ej. --flash-attn, --cont-batching)."
  },
  memoryOrchestratorInfo: {
    title: "Orquestador de Memoria VRAM/RAM",
    description: "Coordina la memoria entre Ollama, Llama.cpp y ComfyUI, liberando automáticamente modelos inactivos para prevenir saturación de VRAM y memoria del sistema."
  },
  gddSevenPointsExport: {
    title: "Exportar GDD en Markdown",
    description: "Descarga el documento de diseño de juego completo (GDD de 7 puntos) en formato .md formateado para tu equipo o repositorio."
  },
  turnaroundSinglePassToggle: {
    title: "Hoja de Modelo en Pase Único",
    description: "Genera las 4 vistas del personaje en una única inferencia rápida mediante un LoRA especializado en giros."
  }
};
